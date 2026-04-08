import {
  GoogleGenerativeAI,
  GenerativeModel,
  Content,
  Part,
} from '@google/generative-ai';
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
 * Google Gemini strategy. Used by the INTAKE_AGENT, TRIAGE_AGENT and
 * EMAIL_COMPOSER agent roles by default.
 */
export class GeminiStrategy implements LlmStrategy {
  private readonly client: GoogleGenerativeAI;

  constructor(
    apiKey: string,
    private readonly defaultModel: string = 'gemini-2.5-flash',
  ) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete(messages: LlmMessage[], context: LlmContext): Promise<LlmResponse> {
    const model = this.buildModel(context);
    const { history, latest } = this.toGeminiHistory(messages);

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(latest);
    const response = result.response;

    return {
      content: response.text(),
      model: context.model ?? this.defaultModel,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  async *stream(
    messages: LlmMessage[],
    context: LlmContext,
  ): AsyncIterable<string> {
    const model = this.buildModel(context);
    const { history, latest } = this.toGeminiHistory(messages);

    const chat = model.startChat({ history });
    const stream = await chat.sendMessageStream(latest);

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }

  async embed(_text: string): Promise<number[]> {
    throw new LlmCapabilityError(LlmProvider.GEMINI, 'embed');
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private buildModel(context: LlmContext): GenerativeModel {
    return this.client.getGenerativeModel({
      model: context.model ?? this.defaultModel,
      systemInstruction: context.systemPrompt,
      generationConfig: {
        maxOutputTokens: context.maxTokens ?? 2048,
        temperature: context.temperature ?? 0.2,
      },
    });
  }

  private toGeminiHistory(messages: LlmMessage[]): {
    history: Content[];
    latest: Part[];
  } {
    if (messages.length === 0) {
      throw new Error('GeminiStrategy.complete requires at least one message');
    }

    const history: Content[] = [];
    const lastIndex = messages.length - 1;

    for (let i = 0; i < lastIndex; i++) {
      const msg = messages[i];
      if (msg.role === LlmMessageRole.SYSTEM) continue;
      history.push({
        role: msg.role === LlmMessageRole.USER ? 'user' : 'model',
        parts: this.toParts(msg),
      });
    }

    return {
      history,
      latest: this.toParts(messages[lastIndex]),
    };
  }

  private toParts(msg: LlmMessage): Part[] {
    const parts: Part[] = [{ text: msg.content }];
    if (msg.attachments) {
      for (const att of msg.attachments) {
        parts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: att.data,
          },
        });
      }
    }
    return parts;
  }
}
