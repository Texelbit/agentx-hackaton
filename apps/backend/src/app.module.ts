import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { EnvModule } from './config/env.module';
import { IncidentsModule } from './incidents/incidents.module';
import { GitHubModule } from './integrations/github/github.module';
import { JiraModule } from './integrations/jira/jira.module';
import { LlmClientModule } from './llm-client/llm-client.module';
import { LlmConfigModule } from './llm-config/llm-config.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrioritiesModule } from './priorities/priorities.module';
import { PrismaModule } from './prisma/prisma.module';
import { RagModule } from './rag/rag.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RolesModule } from './roles/roles.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

/**
 * Root module. Wires every feature module together.
 *
 * Order matters for IoC bridges:
 *  - AuditModule MUST load before incidents/webhooks so AUDIT_RECORDER is bound
 *  - RealtimeModule MUST load before incidents so REALTIME_BROADCASTER is bound
 *  - NotificationsModule MUST load before incidents so INCIDENT_NOTIFIER is bound
 *  - IncidentsModule MUST load before chat so INCIDENT_FROM_CHAT_CREATOR is bound
 */
@Module({
  imports: [
    EnvModule,
    PrismaModule,
    LlmClientModule,
    SystemConfigModule,
    LlmConfigModule,
    AuditModule,
    AuthModule,
    UsersModule,
    PrioritiesModule,
    RolesModule,
    JiraModule,
    GitHubModule,
    RagModule,
    RealtimeModule,
    NotificationsModule,
    IncidentsModule,
    ChatModule,
    WebhooksModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
