import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider } from '../enums/llm-provider.enum';
import { LlmCapabilityError } from '../errors/llm-capability.error';
import {
  LlmMessage,
  LlmMessageRole,
} from '../interfaces/llm-message.interface';
import {
  LlmContext,
  LlmResponse,
  LlmStrategy,
} from '../interfaces/llm-strategy.interface';

/**
 * Anthropic Claude strategy. Optional in this project — only wired up if an
 * admin selects ANTHROPIC as the provider for some agent role.
 */
export class AnthropicStrategy implements LlmStrategy {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly defaultModel: string = 'claude-sonnet-4-20250514',
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(messages: LlmMessage[], context: LlmContext): Promise<LlmResponse> {
    const model = context.model ?? this.defaultModel;
    const response = await this.client.messages.create({
      model,
      max_tokens: context.maxTokens ?? 2048,
      temperature: context.temperature ?? 0.2,
      system: context.systemPrompt,
      messages: this.toAnthropicMessages(messages),
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as Anthropic.TextBlock).text)
      .join('');

    return {
      content: text,
      model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async *stream(
    messages: LlmMessage[],
    context: LlmContext,
  ): AsyncIterable<string> {
    const model = context.model ?? this.defaultModel;
    const stream = this.client.messages.stream({
      model,
      max_tokens: context.maxTokens ?? 2048,
      temperature: context.temperature ?? 0.2,
      system: context.systemPrompt,
      messages: this.toAnthropicMessages(messages),
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }

  async embed(_text: string): Promise<number[]> {
    throw new LlmCapabilityError(LlmProvider.ANTHROPIC, 'embed');
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
    return messages
      .filter((m) => m.role !== LlmMessageRole.SYSTEM)
      .map((m) => {
        const role: 'user' | 'assistant' =
          m.role === LlmMessageRole.USER ? 'user' : 'assistant';

        if (m.attachments && m.attachments.length > 0 && role === 'user') {
          return {
            role,
            content: [
              { type: 'text' as const, text: m.content },
              ...m.attachments.map((att) => ({
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: att.mimeType as
                    | 'image/jpeg'
                    | 'image/png'
                    | 'image/gif'
                    | 'image/webp',
                  data: att.data,
                },
              })),
            ],
          };
        }

        return { role, content: m.content };
      });
  }
}
