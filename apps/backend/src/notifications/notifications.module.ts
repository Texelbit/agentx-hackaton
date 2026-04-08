import { Global, Module } from '@nestjs/common';
import { INCIDENT_NOTIFIER } from '../incidents/interfaces/incident-notifier.interface';
import { LlmClientModule } from '../llm-client/llm-client.module';
import { EmailComposerAgent } from './agents/email-composer.agent';
import { NotificationsService } from './notifications.service';
import { EmailObserver } from './observers/email.observer';
import { SlackObserver } from './observers/slack.observer';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { NotificationRateLimiterService } from './services/notification-rate-limiter.service';

/**
 * Global so the Incidents and Webhooks modules can rely on the
 * `INCIDENT_NOTIFIER` token without re-importing.
 */
@Global()
@Module({
  imports: [LlmClientModule],
  providers: [
    NotificationsService,
    NotificationPreferencesService,
    NotificationRateLimiterService,
    EmailComposerAgent,
    EmailObserver,
    SlackObserver,
    {
      provide: INCIDENT_NOTIFIER,
      useExisting: NotificationsService,
    },
  ],
  exports: [NotificationsService, INCIDENT_NOTIFIER],
})
export class NotificationsModule {}
