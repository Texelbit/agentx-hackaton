import { Global, Logger, Module } from '@nestjs/common';
import {
  AnthropicStrategy,
  GeminiStrategy,
  LlmClient,
  LlmProvider,
  OpenAIStrategy,
} from '@sre/llm-client';
import { EnvConfig } from '../config/env.config';

export const LLM_CLIENT = 'LLM_CLIENT';

/**
 * Wires the `LlmClient` registry with one strategy instance per provider,
 * keyed off the API keys present in env. Anthropic is optional — if the env
 * key is missing the strategy is simply not registered, and any agent role
 * configured to use it will fail loudly at runtime via `LlmClient.forProvider`.
 *
 * Global so that any module (chat, rag, incidents, notifications, ...) can
 * inject `LLM_CLIENT` without re-importing this module.
 */
@Global()
@Module({
  providers: [
    {
      provide: LLM_CLIENT,
      inject: [EnvConfig],
      useFactory: (env: EnvConfig): LlmClient => {
        const logger = new Logger('LlmClientModule');
        const client = new LlmClient();

        client.register(LlmProvider.GEMINI, new GeminiStrategy(env.geminiApiKey));
        logger.log('Registered Gemini strategy');

        client.register(LlmProvider.OPENAI, new OpenAIStrategy(env.openaiApiKey));
        logger.log('Registered OpenAI strategy');

        const anthropicKey = env.anthropicApiKey;
        if (anthropicKey) {
          client.register(LlmProvider.ANTHROPIC, new AnthropicStrategy(anthropicKey));
          logger.log('Registered Anthropic strategy');
        } else {
          logger.warn('ANTHROPIC_API_KEY missing — Anthropic strategy disabled');
        }

        return client;
      },
    },
  ],
  exports: [LLM_CLIENT],
})
export class LlmClientModule {}
