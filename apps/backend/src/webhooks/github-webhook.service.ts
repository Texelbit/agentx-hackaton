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
import { GitHubService } from '../integrations/github/github.service';
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
  body: string | null;
  merged: boolean;
  merge_commit_sha: string | null;
  base: { ref: string };
  head: { ref: string };
  user: { login: string };
  merged_by: { login: string } | null;
}

interface GithubCommit {
  message: string;
  id?: string;
}

interface GithubWebhookPayload {
  ref?: string;
  pull_request?: GithubPullRequest;
  action?: string;
  review?: { state: string };
  commits?: GithubCommit[];
  head_commit?: GithubCommit;
  /** true when the push is a new branch creation (not a code push) */
  created?: boolean;
  deleted?: boolean;
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
    private readonly github: GitHubService,
    private readonly jira: JiraService,
    @Optional()
    @Inject(AUDIT_RECORDER)
    private readonly audit?: IAuditRecorder,
  ) {}

  async handle(
    githubEventHeader: string,
    payload: GithubWebhookPayload,
  ): Promise<void> {
    this.logger.log(
      `Webhook received: header="${githubEventHeader}" action="${payload.action ?? 'n/a'}" ` +
      `ref="${payload.ref ?? 'n/a'}" PR="${payload.pull_request ? `#${payload.pull_request.number} ${payload.pull_request.head.ref}→${payload.pull_request.base.ref} merged=${payload.pull_request.merged}` : 'none'}" ` +
      `commits=${payload.commits?.length ?? 0}`,
    );

    const eventType = this.mapGithubEvent(githubEventHeader, payload);
    if (!eventType) {
      this.logger.log(`Ignoring unsupported GitHub event "${githubEventHeader}"`);
      return;
    }

    // Ignore branch creation/deletion push events — GitHub sends a push with
    // created=true and 0 commits when a branch is first created. This is NOT
    // a real code push and must not trigger a status transition.
    if (
      eventType === GithubEventType.PUSH &&
      (payload.created === true || payload.deleted === true || (payload.commits ?? []).length === 0)
    ) {
      this.logger.log(
        `Ignoring PUSH (created=${payload.created} deleted=${payload.deleted} commits=${payload.commits?.length ?? 0}) — not a code push`,
      );
      return;
    }

    const branchName = this.extractBranchName(eventType, payload);
    if (!branchName) {
      this.logger.log(`No branch name resolvable for ${eventType}`);
      return;
    }

    // Resolve affected incidents. First try the branch name directly (normal
    // feature branch flow). If no ticket key found (e.g. `dev`, `qa`, `main`),
    // search PR title, body, and commit messages for ticket keys — this handles
    // environment-to-environment merges (dev→qa, qa→main).
    const incidents = await this.resolveIncidents(branchName, eventType, payload);
    if (incidents.length === 0) {
      this.logger.log(`No incidents resolved for branch ${branchName}`);
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

    // Apply to all resolved incidents
    for (const incident of incidents) {
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

      // Push the transition to Jira (best-effort)
      if (matched.jiraStatusId && incident.jiraTicketKey) {
        try {
          await this.jira.transitionToStatus(incident.jiraTicketKey, matched.jiraStatusId);
        } catch (err) {
          this.logger.error(
            `Jira transition failed for ${incident.jiraTicketKey}: ${(err as Error).message}`,
          );
        }
      } else if (!matched.jiraStatusId) {
        this.logger.warn(
          `BranchStateRule ${matched.id} has no jiraStatusId — run \`npm run seed:jira\``,
        );
      }

      // Apply the status change in our DB
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

      this.logger.log(
        `${incident.jiraTicketKey}: ${previousStatus} → ${matched.targetStatus} (via ${eventType} on ${branchName})`,
      );
    }
  }

  /**
   * Resolves incidents affected by this webhook event.
   *
   * Strategy:
   *   1. Try extracting a ticket key from the branch name (feature branch flow)
   *   2. If not found (env branch like `dev`, `qa`), scan the PR title, body,
   *      and commit messages for ticket keys (environment merge flow)
   */
  private async resolveIncidents(
    branchName: string,
    eventType: GithubEventType,
    payload: GithubWebhookPayload,
  ) {
    // Strategy 1: ticket key in branch name
    const directKey = this.branchNaming.extractTicketKey(branchName);
    if (directKey) {
      const incident = await this.prisma.incident.findFirst({
        where: { jiraTicketKey: directKey },
      });
      return incident ? [incident] : [];
    }

    // Strategy 2: scan PR metadata + commit messages for ticket keys (env merge).
    // For PUSH events on env branches, skip — the PR_MERGED event will handle
    // the transition with the correct rule. Without this guard, the PUSH "any
    // branch" rule fires first and overrides the PR_MERGED rule.
    if (eventType === GithubEventType.PUSH) {
      this.logger.log(
        `Skipping PUSH on env branch "${branchName}" — waiting for PR event`,
      );
      return [];
    }

    const textSources: string[] = [];

    if (payload.pull_request) {
      textSources.push(
        payload.pull_request.title,
        payload.pull_request.body ?? '',
        payload.pull_request.head.ref,
      );
    }

    if (payload.commits) {
      textSources.push(...payload.commits.map((c) => c.message));
    }

    if (payload.head_commit) {
      textSources.push(payload.head_commit.message);
    }

    // If we have a PR number but no useful text yet, fetch commit messages
    // from the GitHub API (the pull_request webhook event has commits=0)
    if (payload.pull_request && textSources.every((t) => !t.match(/[A-Z][A-Z0-9]+-\d+/))) {
      try {
        const prCommits = await this.github.listPrCommitMessages(
          payload.pull_request.number,
        );
        textSources.push(...prCommits);
        this.logger.log(
          `Fetched ${prCommits.length} commit messages from PR #${payload.pull_request.number}`,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to fetch PR commits: ${(err as Error).message}`,
        );
      }
    }

    if (textSources.length === 0) {
      this.logger.warn(
        `No text sources for env branch "${branchName}" (event: ${eventType})`,
      );
      return [];
    }

    const combined = textSources.join('\n');

    // Extract ALL ticket keys (PROJ-123 pattern) from the combined text
    const keyPattern = /[A-Z][A-Z0-9]+-\d+/g;
    const keys = [...new Set(combined.match(keyPattern) ?? [])] as string[];

    if (keys.length === 0) return [];

    this.logger.log(
      `Env branch "${branchName}" — found ticket keys in metadata: ${keys.join(', ')}`,
    );

    const incidents = await this.prisma.incident.findMany({
      where: { jiraTicketKey: { in: keys } },
    });
    return incidents;
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
