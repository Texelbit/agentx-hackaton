import { LlmMessage } from './llm-message.interface';

export interface LlmContext {
  /** System prompt that frames the agent's behavior. */
  systemPrompt: string;
  /** Optional precomputed RAG context to inline into the user prompt. */
  ragContext?: string;
  /** Hard cap on output tokens. */
  maxTokens?: number;
  /** Sampling temperature (0 = deterministic). */
  temperature?: number;
  /** Override for the default model resolved by the strategy. */
  model?: string;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  content: string;
  usage: LlmUsage;
  model: string;
}

/**
 * Strategy contract for any LLM provider.
 *
 * Each provider implements completion, streaming and embeddings — when a
 * capability is unsupported the implementation MUST throw `LlmCapabilityError`
 * (defined in `errors/llm-capability.error.ts`) so the caller can fall back to
 * another provider via the `LlmClient` registry.
 */
export interface LlmStrategy {
  /** One-shot completion. */
  complete(messages: LlmMessage[], context: LlmContext): Promise<LlmResponse>;

  /** Streamed completion — yields content deltas as they arrive. */
  stream(messages: LlmMessage[], context: LlmContext): AsyncIterable<string>;

  /** Generate an embedding vector for the given text. */
  embed(text: string): Promise<number[]>;
}
