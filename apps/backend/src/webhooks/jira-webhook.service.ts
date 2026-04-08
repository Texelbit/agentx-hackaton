import {
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { IncidentStatus } from '@prisma/client';
import {
  AuditAction,
  AuditActorType,
} from '../common/enums';
import { IncidentsService } from '../incidents/incidents.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUDIT_RECORDER,
  IAuditRecorder,
} from '../audit/interfaces/audit-recorder.interface';

interface JiraChangelogItem {
  field: string;
  fromString: string | null;
  toString: string | null;
}

interface JiraWebhookPayload {
  webhookEvent?: string;
  issue?: {
    key: string;
    fields?: { status?: { name: string } };
  };
  user?: { accountId: string; displayName: string };
  changelog?: { items: JiraChangelogItem[] };
}

/**
 * Reverse-syncs Jira ticket changes back into our DB.
 *
 * The mapping from Jira status name → internal `IncidentStatus` is read from
 * `jira_status_mappings`, which is populated by `seed:jira` after discovering
 * the project's actual status set.
 */
@Injectable()
export class JiraWebhookService {
  private readonly logger = new Logger(JiraWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentsService,
    @Optional()
    @Inject(AUDIT_RECORDER)
    private readonly audit?: IAuditRecorder,
  ) {}

  async handle(payload: JiraWebhookPayload): Promise<void> {
    if (!payload.issue?.key) {
      this.logger.log('Jira webhook with no issue key — ignored');
      return;
    }

    const incident = await this.prisma.incident.findFirst({
      where: { jiraTicketKey: payload.issue.key },
    });
    if (!incident) {
      this.logger.log(`No internal incident for Jira ${payload.issue.key}`);
      return;
    }

    const statusChange = payload.changelog?.items.find(
      (i) => i.field === 'status',
    );
    if (!statusChange?.toString) {
      this.logger.log(`Jira webhook had no status change for ${payload.issue.key}`);
      return;
    }

    const mapping = await this.prisma.jiraStatusMapping.findFirst({
      where: { jiraStatusName: statusChange.toString },
    });
    if (!mapping) {
      this.logger.warn(
        `No JiraStatusMapping for "${statusChange.toString}" — run seed:jira`,
      );
      return;
    }

    const newStatus = mapping.internalStatus as IncidentStatus;
    if (newStatus === incident.status) {
      return;
    }

    await this.incidents.applyStatusChange(incident.id, newStatus);

    await this.audit?.record({
      actorType: AuditActorType.JIRA_WEBHOOK,
      action: AuditAction.STATUS_CHANGE,
      entity: 'Incident',
      entityId: incident.id,
      before: { status: incident.status },
      after: { status: newStatus },
      metadata: {
        jiraKey: payload.issue.key,
        jiraEvent: payload.webhookEvent ?? null,
        jiraUserAccountId: payload.user?.accountId ?? null,
        jiraUserDisplayName: payload.user?.displayName ?? null,
      },
    });
  }
}
