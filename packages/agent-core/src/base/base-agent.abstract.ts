import {
  LlmClient,
  LlmMessage,
  LlmMessageRole,
  LlmResponse,
} from '@sre/llm-client';
import { AgentRole } from '../enums/agent-role.enum';
import {
  AgentContext,
  AgentInput,
  AgentOutput,
} from '../interfaces/agent.interface';
import { ILlmConfigResolver } from '../interfaces/llm-config-resolver.interface';

/**
 * Abstract base for non-conversational, single-shot agents.
 *
 * Implements the **Template Method** pattern: `run()` orchestrates the
 * pipeline (build context → build prompt → call LLM → parse response) while
 * leaving every step abstract for subclasses to override.
 *
 * Subclasses must NOT override `run()` directly — they only implement the
 * four protected hooks. This guarantees every agent in the system follows
 * the same lifecycle and is observable in the same way.
 */
export abstract class BaseAgent<
  TInput extends AgentInput,
  TOutput extends AgentOutput,
> {
  protected constructor(
    protected readonly llmClient: LlmClient,
    protected readonly llmConfigResolver: ILlmConfigResolver,
    protected readonly agentRole: AgentRole,
  ) {}

  /**
   * Template method — final by convention. Do not override.
   */
  async run(input: TInput): Promise<TOutput> {
    const cfg = await this.llmConfigResolver.resolve(this.agentRole);
    const strategy = this.llmClient.forProvider(cfg.provider);

    const context = await this.buildContext(input);
    const messages = this.buildMessages(context);

    const response = await strategy.complete(messages, {
      systemPrompt: this.getSystemPrompt(),
      model: cfg.model,
      temperature: this.getTemperature(),
      maxTokens: this.getMaxTokens(),
    });

    return this.parseResponse(response, context);
  }

  // ── Hooks subclasses MUST implement ────────────────────────────────────

  protected abstract buildContext(input: TInput): Promise<AgentContext<TInput>>;
  protected abstract buildMessages(context: AgentContext<TInput>): LlmMessage[];
  protected abstract getSystemPrompt(): string;
  protected abstract parseResponse(
    response: LlmResponse,
    context: AgentContext<TInput>,
  ): TOutput;

  // ── Hooks subclasses MAY override ──────────────────────────────────────

  protected getTemperature(): number {
    return 0.2;
  }

  protected getMaxTokens(): number {
    return 2048;
  }

  // ── Convenience builders for subclasses ────────────────────────────────

  protected userMessage(content: string): LlmMessage {
    return { role: LlmMessageRole.USER, content };
  }

  protected assistantMessage(content: string): LlmMessage {
    return { role: LlmMessageRole.ASSISTANT, content };
  }
}
