import { Global, Module } from '@nestjs/common';
import { LlmConfigController } from './llm-config.controller';
import { LlmConfigService } from './llm-config.service';
import { LlmModelsService } from './llm-models.service';
import { LlmProvidersService } from './llm-providers.service';

/**
 * Global so any agent class can inject `LlmConfigService` (which implements
 * `ILlmConfigResolver`) without each feature module re-importing it.
 */
@Global()
@Module({
  controllers: [LlmConfigController],
  providers: [LlmConfigService, LlmProvidersService, LlmModelsService],
  exports: [LlmConfigService, LlmProvidersService, LlmModelsService],
})
export class LlmConfigModule {}
