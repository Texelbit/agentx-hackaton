import { Global, Module } from '@nestjs/common';
import { INCIDENT_FROM_CHAT_CREATOR } from '../chat/interfaces/incident-from-chat-creator.interface';
import { GitHubModule } from '../integrations/github/github.module';
import { JiraModule } from '../integrations/jira/jira.module';
import { LlmClientModule } from '../llm-client/llm-client.module';
import { PrioritiesModule } from '../priorities/priorities.module';
import { SREAgent } from './agents/sre.agent';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { IncidentsRepository } from './repositories/incidents.repository';
import { BranchNamingService } from './services/branch-naming.service';
import { IncidentLinksService } from './services/incident-links.service';

/**
 * Incidents module — owns the full incident lifecycle.
 *
 * Provides `IncidentsService` under the `INCIDENT_FROM_CHAT_CREATOR` token
 * (defined in `chat/interfaces`) so the Chat module can finalize sessions
 * without a hard dependency back to incidents. The module is `@Global()` and
 * exports the bridge token so `ChatController.@Optional() @Inject(...)`
 * resolves to the live `IncidentsService` instance at runtime.
 */
@Global()
@Module({
  imports: [LlmClientModule, JiraModule, GitHubModule, PrioritiesModule],
  controllers: [IncidentsController],
  providers: [
    IncidentsService,
    IncidentsRepository,
    SREAgent,
    BranchNamingService,
    IncidentLinksService,
    {
      provide: INCIDENT_FROM_CHAT_CREATOR,
      useExisting: IncidentsService,
    },
  ],
  exports: [
    IncidentsService,
    IncidentLinksService,
    BranchNamingService,
    INCIDENT_FROM_CHAT_CREATOR,
  ],
})
export class IncidentsModule {}
