import { Global, Module } from '@nestjs/common';
import { LlmClientModule } from '../llm-client/llm-client.module';
import { IndexerService } from './indexer.service';
import { RagService } from './rag.service';

/**
 * Global so the chat / incidents / agents modules can inject `RagService`
 * without re-importing this module.
 */
@Global()
@Module({
  imports: [LlmClientModule],
  providers: [RagService, IndexerService],
  exports: [RagService, IndexerService],
})
export class RagModule {}
