import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { NotificationChannel, NotificationEvent } from '../../common/enums';
import { EnvConfig } from '../../config/env.config';
import { EmailComposerAgent } from '../agents/email-composer.agent';
import {
  NotificationObserver,
  NotificationPayload,
} from '../interfaces/notification-payload.interface';

/**
 * Email observer backed by SMTP via nodemailer.
 *
 * Default profile: Google Workspace / Gmail. Auth uses an **App Password**
 * generated in the Google account security settings — your real Workspace
 * password is never used.
 *
 * Configuration prefers the nodemailer `service` shortcut (e.g. `gmail`)
 * which auto-resolves host/port/secure. If `SMTP_SERVICE` is not set, the
 * observer falls back to explicit `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE` so
 * non-Gmail providers (Mailgun, SES, custom Postfix, ...) keep working.
 *
 * For `STATUS_DONE` events the body is composed by `EmailComposerAgent`
 * (Gemini) so the resolution email reads like a real on-call writing it.
 * Other events use a short structured template — the LLM is only invoked
 * where it adds value. Every email gets a branded footer derived from the
 * `EMAIL_APP_NAME` / `EMAIL_DEFAULT_COMPANY` / `EMAIL_SUPPORT_EMAIL` /
 * `EMAIL_COMPANY_ADDRESS` env vars.
 */
@Injectable()
export class EmailObserver implements NotificationObserver, OnModuleInit {
  readonly channel = NotificationChannel.EMAIL;
  private readonly logger = new Logger(EmailObserver.name);
  private transporter!: Transporter;

  constructor(
    private readonly env: EnvConfig,
    private readonly composer: EmailComposerAgent,
  ) {}

  onModuleInit(): void {
    const service = this.env.smtpService;
    const auth = {
      user: this.env.smtpUser,
      pass: this.env.smtpPass,
    };

    // Prefer nodemailer's `service` shortcut when set (cleaner for Gmail)
    this.transporter = service
      ? nodemailer.createTransport({ service, auth })
      : nodemailer.createTransport({
          host: this.env.smtpHost,
          port: this.env.smtpPort,
          secure: this.env.smtpSecure,
          auth,
        });

    // Best-effort connection check at boot. We log but don't crash — a flaky
    // SMTP host should never prevent the backend from serving requests.
    this.transporter
      .verify()
      .then(() =>
        this.logger.log(
          `SMTP transport ready (${service ?? this.env.smtpHost})`,
        ),
      )
      .catch((err: Error) =>
        this.logger.warn(`SMTP verify failed: ${err.message}`),
      );
  }

  async send(payload: NotificationPayload): Promise<void> {
    const { subject, bodyMarkdown } = await this.renderBody(payload);

    try {
      const info = await this.transporter.sendMail({
        from: this.env.emailFrom,
        to: payload.recipient.email,
        subject,
        text: bodyMarkdown,
      });
      this.logger.log(
        `Email sent → ${payload.recipient.email} (${payload.event}) [id=${info.messageId}]`,
      );
    } catch (err) {
      this.logger.error(
        `Email send failed for ${payload.recipient.email}: ${(err as Error).message}`,
      );
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async renderBody(payload: NotificationPayload): Promise<{
    subject: string;
    bodyMarkdown: string;
  }> {
    const i = payload.incident;

    if (payload.event === NotificationEvent.STATUS_DONE) {
      try {
        const composed = await this.composer.run({
          recipientName: payload.recipient.fullName,
          incidentTitle: i.title,
          triageSummary: i.triageSummary,
          resolutionNotes: i.resolutionNotes,
          prUrl: i.githubPrUrl,
          mergeCommitSha: i.mergeCommitSha,
          mergedBy: (payload.metadata?.mergedBy as string) ?? null,
          appName: this.env.emailAppName,
          companyName: this.env.emailDefaultCompany,
        });
        return {
          subject: composed.subject,
          bodyMarkdown: this.appendFooter(composed.bodyMarkdown),
        };
      } catch (err) {
        this.logger.warn(
          `EmailComposerAgent failed, falling back to template: ${(err as Error).message}`,
        );
      }
    }

    const fallback = [
      `Hi ${payload.recipient.fullName},`,
      ``,
      `Incident "${i.title}" is now in status **${i.status}**.`,
      ``,
      i.jiraTicketUrl ? `Jira ticket: ${i.jiraTicketUrl}` : '',
      i.githubBranch ? `GitHub branch: ${i.githubBranch}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      subject: `[${i.priorityName}] ${i.title}`,
      bodyMarkdown: this.appendFooter(fallback),
    };
  }

  /**
   * Appends a branded plain-text footer derived from EMAIL_* env vars.
   * Empty values are skipped — the footer always renders cleanly.
   */
  private appendFooter(body: string): string {
    const lines: string[] = [];
    lines.push(`— ${this.env.emailAppName}`);

    const company = this.env.emailDefaultCompany;
    if (company) lines.push(company);

    const address = this.env.emailCompanyAddress;
    if (address) lines.push(address);

    const support = this.env.emailSupportEmail;
    if (support) lines.push(`Support: ${support}`);

    return `${body}\n\n${lines.join('\n')}`;
  }
}
