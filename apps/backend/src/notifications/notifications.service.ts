import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationEvent,
} from '../common/enums';
import { IIncidentNotifier } from '../incidents/interfaces/incident-notifier.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationObserver,
  NotificationPayload,
} from './interfaces/notification-payload.interface';
import { EmailObserver } from './observers/email.observer';
import { SlackObserver } from './observers/slack.observer';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { NotificationRateLimiterService } from './services/notification-rate-limiter.service';

/**
 * Orchestrates per-channel observers via the **Observer** pattern.
 *
 * Implements `IIncidentNotifier` so `IncidentsService` and the webhooks
 * module can dispatch notifications without depending on this module.
 */
@Injectable()
export class NotificationsService implements IIncidentNotifier {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly observers: Map<NotificationChannel, NotificationObserver>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: NotificationPreferencesService,
    private readonly rateLimiter: NotificationRateLimiterService,
    emailObserver: EmailObserver,
    slackObserver: SlackObserver,
  ) {
    this.observers = new Map<NotificationChannel, NotificationObserver>([
      [NotificationChannel.EMAIL, emailObserver],
      [NotificationChannel.SLACK, slackObserver],
    ]);
  }

  async dispatch(args: {
    incidentId: string;
    event: NotificationEvent;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: args.incidentId },
      include: { priority: true },
    });
    if (!incident) {
      this.logger.warn(`dispatch: incident ${args.incidentId} not found`);
      return;
    }

    for (const [channel, observer] of this.observers) {
      const recipients = await this.preferences.resolveRecipients(
        args.event,
        channel,
        incident.reporterId,
      );

      for (const recipient of recipients) {
        const allowed = await this.rateLimiter.tryConsume({
          incidentId: incident.id,
          event: args.event,
          channel,
          recipient: recipient.email,
        });
        if (!allowed) continue;

        const payload: NotificationPayload = {
          event: args.event,
          metadata: args.metadata,
          incident: {
            id: incident.id,
            title: incident.title,
            description: incident.description,
            status: incident.status,
            priorityName: incident.priority.name,
            service: incident.service,
            reporterEmail: incident.reporterEmail,
            jiraTicketKey: incident.jiraTicketKey,
            jiraTicketUrl: incident.jiraTicketUrl,
            githubBranch: incident.githubBranch,
            githubPrUrl: incident.githubPrUrl,
            mergeCommitSha: incident.mergeCommitSha,
            triageSummary: incident.triageSummary,
            resolutionNotes: incident.resolutionNotes,
          },
          recipient,
        };

        try {
          await observer.send(payload);
        } catch (err) {
          this.logger.error(
            `${channel} observer failed for ${recipient.email}: ${(err as Error).message}`,
          );
        }
      }
    }
  }
}
