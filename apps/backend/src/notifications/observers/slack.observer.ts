import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '../../common/enums';
import { EnvConfig } from '../../config/env.config';
import {
  NotificationObserver,
  NotificationPayload,
} from '../interfaces/notification-payload.interface';

/**
 * Slack observer using a single workspace incoming webhook URL from env.
 * Per-user mention happens client-side via Slack's `<@user>` syntax — the
 * preference table only controls whether the user receives the message at
 * all (Slack lets users mute channels themselves).
 */
@Injectable()
export class SlackObserver implements NotificationObserver {
  readonly channel = NotificationChannel.SLACK;
  private readonly logger = new Logger(SlackObserver.name);

  constructor(private readonly env: EnvConfig) {}

  async send(payload: NotificationPayload): Promise<void> {
    const i = payload.incident;
    const lines = [
      `*[${i.priorityName}] ${i.title}*`,
      `Status: \`${i.status}\` · Service: \`${i.service}\``,
      i.jiraTicketUrl ? `Jira: ${i.jiraTicketUrl}` : '',
      i.githubBranch ? `Branch: \`${i.githubBranch}\`` : '',
      `Recipient: ${payload.recipient.email} (${payload.event})`,
    ].filter(Boolean);

    try {
      const res = await fetch(this.env.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lines.join('\n') }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Slack webhook ${res.status}: ${text}`);
      }
      this.logger.log(
        `Slack sent → ${payload.recipient.email} (${payload.event})`,
      );
    } catch (err) {
      this.logger.error(`Slack send failed: ${(err as Error).message}`);
    }
  }
}
