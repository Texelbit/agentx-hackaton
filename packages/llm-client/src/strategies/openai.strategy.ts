import OpenAI from 'openai';
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
 * OpenAI strategy. Primarily used for embeddings (`text-embedding-3-small`),
 * but also supports completion/streaming when an admin configures it as the
 * provider for a chat agent role from the `llm_configs` table.
 */
export class OpenAIStrategy implements LlmStrategy {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly defaultCompletionModel: string = 'gpt-4o-mini',
    private readonly defaultEmbeddingModel: string = 'text-embedding-3-small',
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(messages: LlmMessage[], context: LlmContext): Promise<LlmResponse> {
    const model = context.model ?? this.defaultCompletionModel;
    const response = await this.client.chat.completions.create({
      model,
      max_tokens: context.maxTokens ?? 2048,
      temperature: context.temperature ?? 0.2,
      messages: this.toOpenAIMessages(messages, context.systemPrompt),
    });

    const choice = response.choices[0];
    return {
      content: choice?.message?.content ?? '',
      model,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *stream(
    messages: LlmMessage[],
    context: LlmContext,
  ): AsyncIterable<string> {
    const model = context.model ?? this.defaultCompletionModel;
    const stream = await this.client.chat.completions.create({
      model,
      max_tokens: context.maxTokens ?? 2048,
      temperature: context.temperature ?? 0.2,
      messages: this.toOpenAIMessages(messages, context.systemPrompt),
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new LlmCapabilityError(LlmProvider.OPENAI, 'embed');
    }
    const response = await this.client.embeddings.create({
      model: this.defaultEmbeddingModel,
      input: text,
    });
    return response.data[0].embedding;
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private toOpenAIMessages(
    messages: LlmMessage[],
    systemPrompt: string,
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.role === LlmMessageRole.SYSTEM) {
        out.push({ role: 'system', content: msg.content });
        continue;
      }

      const role = msg.role === LlmMessageRole.USER ? 'user' : 'assistant';

      if (msg.attachments && msg.attachments.length > 0 && role === 'user') {
        out.push({
          role: 'user',
          content: [
            { type: 'text', text: msg.content },
            ...msg.attachments.map((att) => ({
              type: 'image_url' as const,
              image_url: {
                url: `data:${att.mimeType};base64,${att.data}`,
              },
            })),
          ],
        });
      } else {
        out.push({ role, content: msg.content });
      }
    }

    return out;
  }
}
