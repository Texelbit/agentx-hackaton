import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { GitHubWebhookService } from './github-webhook.service';
import { WebhookHmacGuard } from './guards/webhook-hmac.guard';
import { JiraWebhookService } from './jira-webhook.service';
import { WebhooksController } from './webhooks.controller';

/**
 * Webhooks module — receives external events from GitHub and Jira.
 *
 * Imports `IncidentsModule` to reuse `IncidentsService.applyStatusChange`
 * and `BranchNamingService.extractTicketKey`. The audit dependency is
 * loose-coupled via the `AUDIT_RECORDER` token (provided by Block 10).
 */
@Module({
  imports: [IncidentsModule],
  controllers: [WebhooksController],
  providers: [GitHubWebhookService, JiraWebhookService, WebhookHmacGuard],
})
export class WebhooksModule {}
