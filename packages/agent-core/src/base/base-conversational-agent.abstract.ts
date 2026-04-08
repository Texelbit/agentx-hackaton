import {
  LlmClient,
  LlmMessage,
  LlmMessageRole,
} from '@sre/llm-client';
import { AgentRole } from '../enums/agent-role.enum';
import { ConversationTurn } from '../interfaces/agent.interface';
import { ILlmConfigResolver } from '../interfaces/llm-config-resolver.interface';

/**
 * Abstract base for conversational agents (chat-style intake, follow-up
 * dialogues, etc.).
 *
 * Subclasses implement three semantic hooks:
 *
 *  - `getSystemPrompt()` — defines the agent's persona and intent
 *  - `shouldFinalize()`  — decides whether enough info has been collected
 *  - `extract()`         — produces a structured payload from the history
 *
 * The base class handles the streaming pipe to the LLM via the configured
 * provider/model, so subclasses never touch the LLM client directly.
 */
export abstract class BaseConversationalAgent<TExtracted> {
  protected constructor(
    protected readonly llmClient: LlmClient,
    protected readonly llmConfigResolver: ILlmConfigResolver,
    protected readonly agentRole: AgentRole,
  ) {}

  /**
   * Streams the agent's reply to the latest user turn. The full conversation
   * history (including the new user turn at the end) must be passed in.
   */
  async *streamReply(history: ConversationTurn[]): AsyncIterable<string> {
    const cfg = await this.llmConfigResolver.resolve(this.agentRole);
    const strategy = this.llmClient.forProvider(cfg.provider);

    const messages = this.toLlmMessages(history);

    yield* strategy.stream(messages, {
      systemPrompt: this.getSystemPrompt(),
      model: cfg.model,
      temperature: this.getTemperature(),
      maxTokens: this.getMaxTokens(),
    });
  }

  /**
   * Non-streaming reply — useful for tool calls or for final summarization.
   */
  async reply(history: ConversationTurn[]): Promise<string> {
    const cfg = await this.llmConfigResolver.resolve(this.agentRole);
    const strategy = this.llmClient.forProvider(cfg.provider);

    const response = await strategy.complete(this.toLlmMessages(history), {
      systemPrompt: this.getSystemPrompt(),
      model: cfg.model,
      temperature: this.getTemperature(),
      maxTokens: this.getMaxTokens(),
    });

    return response.content;
  }

  // ── Hooks subclasses MUST implement ────────────────────────────────────

  protected abstract getSystemPrompt(): string;

  /** True when the agent has gathered enough info to trigger downstream work. */
  abstract shouldFinalize(history: ConversationTurn[]): Promise<boolean>;

  /** Builds the structured payload extracted from the conversation. */
  abstract extract(history: ConversationTurn[]): Promise<TExtracted>;

  // ── Hooks subclasses MAY override ──────────────────────────────────────

  protected getTemperature(): number {
    return 0.4;
  }

  protected getMaxTokens(): number {
    return 1024;
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private toLlmMessages(history: ConversationTurn[]): LlmMessage[] {
    return history.map<LlmMessage>((t) => ({
      role: t.role,
      content: t.content,
      attachments: t.attachments,
    }));
  }

  protected userMessage(content: string): LlmMessage {
    return { role: LlmMessageRole.USER, content };
  }
}
