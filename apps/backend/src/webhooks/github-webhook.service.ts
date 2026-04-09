import {
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  AuditAction,
  AuditActorType,
  GithubEventType,
  IncidentStatus,
} from '../common/enums';
import { IncidentsService } from '../incidents/incidents.service';
import { BranchNamingService } from '../incidents/services/branch-naming.service';
import { JiraService } from '../integrations/jira/jira.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUDIT_RECORDER,
  IAuditRecorder,
} from '../audit/interfaces/audit-recorder.interface';

interface GithubPullRequest {
  number: number;
  title: string;
  html_url: string;
  merged: boolean;
  merge_commit_sha: string | null;
  base: { ref: string };
  head: { ref: string };
  user: { login: string };
  merged_by: { login: string } | null;
}

interface GithubWebhookPayload {
  ref?: string;
  pull_request?: GithubPullRequest;
  action?: string;
  review?: { state: string };
}

/**
 * Translates an incoming GitHub webhook event into an `IncidentStatus`
 * transition by consulting the configurable `branch_state_rules` table.
 */
@Injectable()
export class GitHubWebhookService {
  private readonly logger = new Logger(GitHubWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentsService,
    private readonly branchNaming: BranchNamingService,
    private readonly jira: JiraService,
    @Optional()
    @Inject(AUDIT_RECORDER)
    private readonly audit?: IAuditRecorder,
  ) {}

  async handle(
    githubEventHeader: string,
    payload: GithubWebhookPayload,
  ): Promise<void> {
    const eventType = this.mapGithubEvent(githubEventHeader, payload);
    if (!eventType) {
      this.logger.log(`Ignoring unsupported GitHub event "${githubEventHeader}"`);
      return;
    }

    const branchName = this.extractBranchName(eventType, payload);
    if (!branchName) {
      this.logger.log(`No branch name resolvable for ${eventType}`);
      return;
    }

    const ticketKey = this.branchNaming.extractTicketKey(branchName);
    if (!ticketKey) {
      this.logger.log(`Branch ${branchName} does not match naming pattern`);
      return;
    }

    const incident = await this.prisma.incident.findFirst({
      where: { jiraTicketKey: ticketKey },
    });
    if (!incident) {
      this.logger.warn(`Incident with Jira key ${ticketKey} not found`);
      return;
    }

    // Ignore events fired by the initial branch creation (GitHub sends a
    // `push` with 0 commits when a branch is created). Without this guard,
    // every new incident immediately jumps from BACKLOG to IN_PROGRESS.
    const ageMs = Date.now() - new Date(incident.createdAt).getTime();
    if (ageMs < 60_000) {
      this.logger.log(
        `Ignoring ${eventType} for ${ticketKey} — incident created ${Math.round(ageMs / 1000)}s ago (likely the initial branch creation push)`,
      );
      return;
    }

    // Find the highest-priority matching rule
    const rules = await this.prisma.branchStateRule.findMany({
      where: { eventType, active: true },
      orderBy: { priority: 'asc' },
    });

    const matched = rules.find((r) => this.matchesCondition(r.condition, payload));
    if (!matched) {
      this.logger.log(`No active rule matched for ${eventType}`);
      return;
    }

    const previousStatus = incident.status;

    // Capture PR fields when present (for the resolution email)
    if (eventType === GithubEventType.PR_MERGED && payload.pull_request) {
      await this.prisma.incident.update({
        where: { id: incident.id },
        data: {
          githubPrUrl: payload.pull_request.html_url,
          mergeCommitSha: payload.pull_request.merge_commit_sha,
        },
      });
    }

    // Push the transition to Jira (best-effort).
    //
    // `matched.jiraStatusId` is a STATUS id (resolved at seed time), but the
    // Jira REST API moves issues by TRANSITION id. `transitionToStatus`
    // resolves that mapping per-issue at runtime so we always pick a
    // transition that's actually valid from the ticket's current state.
    if (matched.jiraStatusId) {
      try {
        await this.jira.transitionToStatus(ticketKey, matched.jiraStatusId);
      } catch (err) {
        // Loud — surfaces in the dev terminal so the user notices a
        // workflow misconfiguration immediately instead of finding out
        // hours later that Jira drifted from the internal DB.
        this.logger.error(
          `Jira transition failed for ${ticketKey}: ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.warn(
        `BranchStateRule ${matched.id} has no jiraStatusId — run \`npm run seed:jira\` to populate the mapping`,
      );
    }

    // Apply the status change in our DB (triggers notifications + realtime)
    await this.incidents.applyStatusChange(incident.id, matched.targetStatus);

    await this.audit?.record({
      actorType: AuditActorType.GITHUB_WEBHOOK,
      action: AuditAction.STATUS_CHANGE,
      entity: 'Incident',
      entityId: incident.id,
      before: { status: previousStatus },
      after: { status: matched.targetStatus },
      metadata: {
        eventType,
        branch: branchName,
        prUrl: payload.pull_request?.html_url ?? null,
        mergedBy: payload.pull_request?.merged_by?.login ?? null,
      },
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private mapGithubEvent(
    header: string,
    payload: GithubWebhookPayload,
  ): GithubEventType | null {
    switch (header) {
      case 'push':
        return GithubEventType.PUSH;
      case 'pull_request':
        if (payload.action === 'opened' || payload.action === 'reopened') {
          return GithubEventType.PR_OPENED;
        }
        if (payload.action === 'closed') {
          return payload.pull_request?.merged
            ? GithubEventType.PR_MERGED
            : GithubEventType.PR_CLOSED;
        }
        return null;
      case 'pull_request_review':
        return payload.review?.state === 'approved'
          ? GithubEventType.PR_REVIEW_APPROVED
          : null;
      default:
        return null;
    }
  }

  private extractBranchName(
    eventType: GithubEventType,
    payload: GithubWebhookPayload,
  ): string | null {
    if (eventType === GithubEventType.PUSH) {
      return payload.ref?.replace('refs/heads/', '') ?? null;
    }
    return payload.pull_request?.head?.ref ?? null;
  }

  private matchesCondition(
    condition: unknown,
    payload: GithubWebhookPayload,
  ): boolean {
    if (!condition || typeof condition !== 'object') return true;
    const c = condition as Record<string, unknown>;

    if (c.baseBranch && payload.pull_request) {
      if (payload.pull_request.base.ref !== c.baseBranch) return false;
    }
    if (c.merged !== undefined && payload.pull_request) {
      if (payload.pull_request.merged !== c.merged) return false;
    }
    return true;
  }
}
