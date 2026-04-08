import { LlmMessage } from '@sre/llm-client';

/**
 * Marker interface for any structured agent input.
 * Agents are free to type their inputs strictly via generics.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AgentInput {}

/**
 * Marker interface for any structured agent output.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AgentOutput {}

/**
 * Generic context bag built by `BaseAgent.buildContext`. Subclasses cast it
 * to their specific shape inside `buildPrompt` / `parseResponse`.
 */
export interface AgentContext<TInput extends AgentInput = AgentInput> {
  input: TInput;
  // Subclasses extend with their RAG hits / external data.
  [key: string]: unknown;
}

/**
 * Snapshot of a conversation turn used by conversational agents.
 */
export interface ConversationTurn extends LlmMessage {
  id: string;
  createdAt: Date;
}
