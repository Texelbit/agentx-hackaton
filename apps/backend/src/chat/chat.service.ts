import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ChatMessageRole, ChatSession } from '@prisma/client';
import { ConversationTurn } from '@sre/agent-core';
import { LlmAttachment, LlmMessageRole } from '@sre/llm-client';
import { IntakeAgent } from './agents/intake.agent';
import { ChatAttachmentDto, SendMessageDto } from './dto/chat.dto';
import { ExtractedIncident } from './interfaces/extracted-incident.interface';
import {
  IIncidentFromChatCreator,
  INCIDENT_FROM_CHAT_CREATOR,
} from './interfaces/incident-from-chat-creator.interface';
import {
  ChatRepository,
  ChatSessionWithMessages,
} from './repositories/chat.repository';

/**
 * Typed events emitted by the chat reply async generator. The controller
 * maps each variant to a Server-Sent Event frame.
 */
export type ChatStreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'agent-done' }
  | { type: 'status'; message: string }
  | { type: 'incident-created'; incidentId: string }
  | { type: 'finalize-error'; message: string };

/**
 * Conversational intake orchestration.
 *
 * Owns the full intake → finalize → create-incident pipeline so the
 * controller stays a thin SSE adapter. The bridge to the Incidents module
 * is consumed via `INCIDENT_FROM_CHAT_CREATOR` (provided as `@Optional()`
 * so the chat module remains buildable in isolation).
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly repo: ChatRepository,
    private readonly intakeAgent: IntakeAgent,
    @Optional()
    @Inject(INCIDENT_FROM_CHAT_CREATOR)
    private readonly incidentCreator?: IIncidentFromChatCreator,
  ) {}

  // ── Public API ───────────────────────────────────────────────────────

  createSession(userId: string): Promise<ChatSession> {
    return this.repo.createSession(userId);
  }

  async getSession(id: string, userId: string): Promise<ChatSessionWithMessages> {
    const session = await this.requireSession(id, userId);
    return session;
  }

  /**
   * Persists the user message, streams the agent's reply as typed events,
   * AND auto-finalizes the session when the agent decides it has gathered
   * enough info. The whole flow happens inside one HTTP request so the
   * frontend never has to click a "create ticket" button.
   *
   * Yields:
   *   { type: 'delta',           content }   — streamed reply chunks
   *   { type: 'agent-done' }                 — agent reply finished
   *   { type: 'incident-created',incidentId} — auto-finalize succeeded
   *   { type: 'finalize-error',  message }   — auto-finalize failed
   */
  async *streamAgentReply(args: {
    sessionId: string;
    userId: string;
    userEmail: string;
    message: SendMessageDto;
  }): AsyncIterable<ChatStreamEvent> {
    const session = await this.requireSession(args.sessionId, args.userId);
    if (session.finalized) {
      throw new BadRequestException('Chat session is already finalized');
    }

    // 1. Persist the user turn first
    await this.repo.appendMessage({
      sessionId: session.id,
      role: ChatMessageRole.USER,
      content: args.message.content,
      attachments: args.message.attachments,
    });

    // 2. Re-fetch with the new turn so the agent sees it
    const updated = await this.repo.findSession(session.id);
    if (!updated) {
      throw new NotFoundException('Chat session vanished mid-flight');
    }

    const history = this.toConversationTurns(updated);

    // 3. Stream the agent reply
    let buffer = '';
    for await (const delta of this.intakeAgent.streamReply(history)) {
      buffer += delta;
      yield { type: 'delta', content: delta };
    }

    // 4. Persist the full agent turn
    await this.repo.appendMessage({
      sessionId: session.id,
      role: ChatMessageRole.AGENT,
      content: buffer,
    });

    yield { type: 'agent-done' };

    // 5. Auto-finalize check — re-load the session including the new agent
    //    turn so shouldFinalize() can read it.
    const afterAgent = await this.repo.findSession(session.id);
    if (!afterAgent) return;

    const fullHistory = this.toConversationTurns(afterAgent);
    const ready = await this.intakeAgent.shouldFinalize(fullHistory);
    if (!ready) return;

    // 6. Finalize + create the incident inline
    try {
      yield { type: 'status', message: 'Analyzing conversation…' };

      const { extracted } = await this.finalizeInternal(
        session.id,
        fullHistory,
      );

      if (!this.incidentCreator) {
        yield {
          type: 'finalize-error',
          message:
            'IncidentsModule is not registered — finalize requires IIncidentFromChatCreator',
        };
        return;
      }

      yield { type: 'status', message: 'Creating incident & running triage…' };

      const incident = await this.incidentCreator.createFromChat({
        chatSessionId: session.id,
        reporterId: args.userId,
        reporterEmail: args.userEmail,
        extracted,
      });

      yield { type: 'incident-created', incidentId: incident.id };
    } catch (err) {
      this.logger.error(
        `Auto-finalize failed for session ${session.id}: ${(err as Error).message}`,
      );
      yield {
        type: 'finalize-error',
        message: (err as Error).message,
      };
    }
  }

  /**
   * Manual finalize endpoint — kept as a fallback in case the auto-finalize
   * path inside `streamAgentReply` failed and the user wants to retry.
   */
  async finalize(
    sessionId: string,
    userId: string,
    userEmail: string,
  ): Promise<{ incidentId: string }> {
    const session = await this.requireSession(sessionId, userId);
    const history = this.toConversationTurns(session);
    const { extracted } = await this.finalizeInternal(sessionId, history);

    if (!this.incidentCreator) {
      throw new Error(
        'IncidentsModule is not registered — finalize requires IIncidentFromChatCreator',
      );
    }

    const incident = await this.incidentCreator.createFromChat({
      chatSessionId: sessionId,
      reporterId: userId,
      reporterEmail: userEmail,
      extracted,
    });

    return { incidentId: incident.id };
  }

  // ── Private workflow ────────────────────────────────────────────────

  private async finalizeInternal(
    sessionId: string,
    history: ConversationTurn[],
  ): Promise<{ session: ChatSession; extracted: ExtractedIncident }> {
    const ready = await this.intakeAgent.shouldFinalize(history);
    if (!ready) {
      throw new BadRequestException(
        'IntakeAgent has not yet collected enough information to finalize',
      );
    }

    const extracted = await this.intakeAgent.extract(history);

    // Collect all image attachments from user messages in this session
    const session = await this.repo.findSession(sessionId);
    if (session) {
      const chatAttachments = session.messages
        .filter((m) => m.role === ChatMessageRole.USER && m.attachments)
        .flatMap((m) => {
          const raw = m.attachments as { mimeType: string; data: string }[];
          return Array.isArray(raw) ? raw : [];
        })
        .filter((a) => a.mimeType && a.data);
      if (chatAttachments.length > 0) {
        extracted.attachments = chatAttachments;
      }
    }

    const finalized = await this.repo.markFinalized(sessionId);

    this.logger.log(
      `Chat session ${sessionId} finalized — extracted "${extracted.title}" with ${extracted.attachments?.length ?? 0} attachments`,
    );

    return { session: finalized, extracted };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async requireSession(
    id: string,
    userId: string,
  ): Promise<ChatSessionWithMessages> {
    const session = await this.repo.findSession(id);
    if (!session) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    if (session.userId !== userId) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    return session;
  }

  private toConversationTurns(
    session: ChatSessionWithMessages,
  ): ConversationTurn[] {
    return session.messages.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      role: this.toLlmRole(m.role),
      content: m.content,
      attachments: this.toLlmAttachments(m.attachments),
    }));
  }

  private toLlmRole(role: ChatMessageRole): LlmMessageRole {
    switch (role) {
      case ChatMessageRole.USER:
        return LlmMessageRole.USER;
      case ChatMessageRole.AGENT:
        return LlmMessageRole.ASSISTANT;
      case ChatMessageRole.SYSTEM:
        return LlmMessageRole.SYSTEM;
      default: {
        const _exhaustive: never = role;
        throw new Error(`Unhandled ChatMessageRole: ${_exhaustive}`);
      }
    }
  }

  private toLlmAttachments(raw: unknown): LlmAttachment[] | undefined {
    if (!raw || !Array.isArray(raw)) return undefined;
    return (raw as ChatAttachmentDto[]).map((a) => ({
      mimeType: a.mimeType,
      data: a.data,
    }));
  }
}
