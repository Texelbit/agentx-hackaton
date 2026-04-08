import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  BaseConversationalAgent,
  ConversationTurn,
} from '@sre/agent-core';
import { LlmClient, LlmMessageRole } from '@sre/llm-client';
import { LlmConfigService } from '../../llm-config/llm-config.service';
import { LLM_CLIENT } from '../../llm-client/llm-client.module';
import { ExtractedIncident } from '../interfaces/extracted-incident.interface';

/**
 * Conversational intake agent.
 *
 * Pretends to be a friendly SRE on-call who collects the minimum viable info
 * to open a useful ticket: title, affected service, reproduction steps and
 * any error output. When the agent decides it has enough context it surfaces
 * a `READY_TO_FINALIZE` token in its reply, which `ChatService` watches for.
 *
 * Subclass of `BaseConversationalAgent` from `@sre/agent-core` — the base
 * class owns the streaming pipe to whichever LLM the admin configured for
 * `INTAKE_AGENT` in the `llm_configs` table.
 */
@Injectable()
export class IntakeAgent extends BaseConversationalAgent<ExtractedIncident> {
  private readonly logger = new Logger(IntakeAgent.name);

  /** Sentinel string the agent uses to indicate finalization in chat replies. */
  static readonly READY_TOKEN = '<<READY_TO_FINALIZE>>';

  constructor(
    @Inject(LLM_CLIENT) llmClient: LlmClient,
    llmConfig: LlmConfigService,
  ) {
    super(llmClient, llmConfig, AgentRole.INTAKE_AGENT);
  }

  protected getSystemPrompt(): string {
    return `You are an SRE on-call engineer running incident intake for an
e-commerce platform built on Reaction Commerce.

Your job is to gather — through a friendly, focused conversation — only
the information that REQUIRES THE USER to provide it:

  1. What they expected to happen vs what actually happened
  2. The exact steps they took (in chronological order)
  3. Any error message, stack trace or screenshot they have
  4. Where in the product it happened (page / feature / URL if applicable)

DO NOT ask the user for things that YOU can infer from the conversation:
  ✗ Never ask for a "title" or "name" for the ticket — you will derive it
  ✗ Never ask for a "priority" or "severity" — the triage agent assigns it
  ✗ Never ask for a "service" or "component" name — you will infer it
  ✗ Never ask for tags, labels, ticket IDs or any internal metadata

Conversation rules:
  - Ask ONE question per turn — never bundle multiple questions in one reply
  - Acknowledge what you've already learned before asking for more
  - When the user attaches an image, describe what you see and use it
  - If something is already answered, NEVER re-ask it
  - Reply in clear, simple English
  - Be empathetic and concise — you're talking to a real person who just
    hit a problem, not filling out a form

Finalization:
  - The minimum bar for a useful ticket is: (a) what went wrong, (b) where
    it happened, (c) at least one reproduction hint OR an error message
  - Once that bar is met, end your FINAL reply with the literal sentinel
    "${IntakeAgent.READY_TOKEN}" on its own line, with NO other text after it
  - Do NOT emit the sentinel before the bar is met
  - Do NOT mention the sentinel to the user — it's an internal marker
  - After emitting the sentinel, the system will automatically derive the
    title, service, priority and other metadata from the conversation —
    you do not need to ask the user about any of that

Never invent technical details the user did not provide.`;
  }

  protected getTemperature(): number {
    return 0.4;
  }

  // ── Finalization detection ───────────────────────────────────────────

  async shouldFinalize(history: ConversationTurn[]): Promise<boolean> {
    // Cheap heuristic first — saves an LLM call when the sentinel is present.
    const lastAgent = [...history]
      .reverse()
      .find((t) => t.role === LlmMessageRole.ASSISTANT);
    if (lastAgent?.content.includes(IntakeAgent.READY_TOKEN)) {
      return true;
    }
    return false;
  }

  // ── Structured extraction ────────────────────────────────────────────

  async extract(history: ConversationTurn[]): Promise<ExtractedIncident> {
    const cfg = await this.llmConfigResolver.resolve(this.agentRole);
    const strategy = this.llmClient.forProvider(cfg.provider);

    const transcript = history
      .filter((t) => t.role !== LlmMessageRole.SYSTEM)
      .map(
        (t) =>
          `${t.role === LlmMessageRole.USER ? 'USER' : 'AGENT'}: ${t.content}`,
      )
      .join('\n');

    const extractionPrompt = `Given the following intake conversation, return
a single JSON object that matches this TypeScript type EXACTLY (no markdown,
no commentary, no code fences):

{
  "title": string,           // <= 120 chars, imperative tone
  "description": string,     // 2–4 sentence summary in user-friendly English
  "service": string,         // affected service/area, lowercase, hyphenated
  "suggestedPriorityName": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
  "reproductionSteps": string,
  "errorOutput": string
}

If the user did not provide a value for a field, return an empty string for
it (or "MEDIUM" for suggestedPriorityName).

Conversation transcript:
${transcript}`;

    const response = await strategy.complete(
      [{ role: LlmMessageRole.USER, content: extractionPrompt }],
      {
        systemPrompt:
          'You are a deterministic JSON extractor. Output only the JSON object.',
        model: cfg.model,
        temperature: 0,
        maxTokens: 800,
      },
    );

    return this.parseExtractionResponse(response.content);
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private parseExtractionResponse(raw: string): ExtractedIncident {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as Partial<ExtractedIncident>;
      return {
        title: (parsed.title ?? '').slice(0, 120) || 'Untitled incident',
        description: parsed.description ?? '',
        service: parsed.service ?? 'unknown',
        suggestedPriorityName: parsed.suggestedPriorityName ?? 'MEDIUM',
        reproductionSteps: parsed.reproductionSteps ?? '',
        errorOutput: parsed.errorOutput ?? '',
      };
    } catch (err) {
      this.logger.error(
        `Failed to parse intake extraction JSON: ${(err as Error).message}\nRaw: ${raw}`,
      );
      throw new Error('IntakeAgent extraction returned invalid JSON');
    }
  }
}
