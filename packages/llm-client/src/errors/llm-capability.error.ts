import { LlmProvider } from '../enums/llm-provider.enum';

/**
 * Thrown when a strategy is asked to perform a capability it does not support
 * (e.g. asking the OpenAI strategy to run a chat completion when it is wired
 * for embeddings only, or vice versa).
 */
export class LlmCapabilityError extends Error {
  constructor(
    public readonly provider: LlmProvider,
    public readonly capability: 'complete' | 'stream' | 'embed',
  ) {
    super(`LLM provider ${provider} does not support capability "${capability}"`);
    this.name = 'LlmCapabilityError';
  }
}
