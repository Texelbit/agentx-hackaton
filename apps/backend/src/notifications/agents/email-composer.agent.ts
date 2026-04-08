import { Inject, Injectable } from '@nestjs/common';
import {
  AgentContext,
  AgentRole,
  BaseAgent,
} from '@sre/agent-core';
import {
  LlmClient,
  LlmMessage,
  LlmMessageRole,
  LlmResponse,
} from '@sre/llm-client';
import { LlmConfigService } from '../../llm-config/llm-config.service';
import { LLM_CLIENT } from '../../llm-client/llm-client.module';

interface EmailComposerInput {
  recipientName: string;
  incidentTitle: string;
  triageSummary: string | null;
  resolutionNotes: string | null;
  prUrl: string | null;
  mergeCommitSha: string | null;
  mergedBy: string | null;
  /** Branding hints — surfaced to the LLM so the email feels on-brand. */
  appName: string;
  companyName: string;
}

interface EmailComposerContext extends AgentContext<EmailComposerInput> {
  input: EmailComposerInput;
}

export interface ComposedEmail {
  subject: string;
  bodyMarkdown: string;
}

/**
 * Writes the resolution email body in human-quality English using the
 * `EMAIL_COMPOSER` agent role (Gemini 2.5 Flash by default).
 */
@Injectable()
export class EmailComposerAgent extends BaseAgent<
  EmailComposerInput,
  ComposedEmail
> {
  constructor(
    @Inject(LLM_CLIENT) llmClient: LlmClient,
    llmConfig: LlmConfigService,
  ) {
    super(llmClient, llmConfig, AgentRole.EMAIL_COMPOSER);
  }

  protected async buildContext(
    input: EmailComposerInput,
  ): Promise<EmailComposerContext> {
    return { input };
  }

  protected getSystemPrompt(): string {
    return `You are a friendly SRE on-call engineer writing a resolution
notification email to the original reporter of an incident.

Tone: warm, concise, professional. Address the reader by first name when
provided. Confirm the issue is resolved, summarize what was fixed in plain
English (no jargon), and link the merged pull request when available.

Output format: a single JSON object — no markdown, no commentary, no code
fences — matching this TypeScript type:

{
  "subject": string,         // <= 90 chars
  "bodyMarkdown": string     // markdown body, ~150–250 words
}`;
  }

  protected getTemperature(): number {
    return 0.5;
  }

  protected buildMessages(context: EmailComposerContext): LlmMessage[] {
    const i = context.input;
    const prompt = `Compose the resolution email.

Sender app: ${i.appName}${i.companyName ? ` (${i.companyName})` : ''}
Recipient name: ${i.recipientName}
Incident title: ${i.incidentTitle}

Triage summary:
${i.triageSummary ?? '_(none)_'}

Resolution notes:
${i.resolutionNotes ?? '_(none)_'}

Merged pull request: ${i.prUrl ?? 'not available'}
Merge commit: ${i.mergeCommitSha ?? 'not available'}
Merged by: ${i.mergedBy ?? 'not recorded'}

Sign the body with the sender app name. Do NOT add a footer with company
or address — that is appended automatically downstream. Return only the
JSON object.`;

    return [{ role: LlmMessageRole.USER, content: prompt }];
  }

  protected parseResponse(
    response: LlmResponse,
    _context: EmailComposerContext,
  ): ComposedEmail {
    const cleaned = response.content
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as Partial<ComposedEmail>;
      return {
        subject: (parsed.subject ?? 'Your incident has been resolved').slice(0, 90),
        bodyMarkdown: parsed.bodyMarkdown ?? response.content,
      };
    } catch {
      return {
        subject: 'Your incident has been resolved',
        bodyMarkdown: response.content,
      };
    }
  }
}
