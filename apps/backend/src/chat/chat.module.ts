import { Module } from '@nestjs/common';
import { LlmClientModule } from '../llm-client/llm-client.module';
import { IntakeAgent } from './agents/intake.agent';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatRepository } from './repositories/chat.repository';

/**
 * Chat module — owns conversational intake.
 *
 * Note: the binding for `INCIDENT_FROM_CHAT_CREATOR` is provided by the
 * `IncidentsModule` (Block 7) so finalization can create real incidents.
 * Until then `ChatController.finalize()` returns a clear runtime error.
 */
@Module({
  imports: [LlmClientModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, IntakeAgent],
  exports: [ChatService, IntakeAgent],
})
export class ChatModule {}
