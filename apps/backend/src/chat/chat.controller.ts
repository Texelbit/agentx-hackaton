import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Permission } from '../common/enums';
import { ChatService, ChatStreamEvent } from './chat.service';
import {
  ChatSessionDto,
  FinalizeResponseDto,
  SendMessageDto,
} from './dto/chat.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('sessions')
  @RequirePermission(Permission.INCIDENTS_CREATE)
  @ApiOperation({ summary: 'Start a new intake conversation' })
  @ApiResponse({ status: 201, type: ChatSessionDto })
  async createSession(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChatSessionDto> {
    const session = await this.chatService.createSession(user.id);
    return {
      id: session.id,
      userId: session.userId,
      finalized: session.finalized,
      createdAt: session.createdAt,
    };
  }

  @Post('sessions/:id/messages')
  @RequirePermission(Permission.INCIDENTS_CREATE)
  @ApiOperation({
    summary:
      'Send a message and stream the agent reply via Server-Sent Events. ' +
      'When the agent decides it has gathered enough info, the session is ' +
      'auto-finalized inline and an `incident-created` SSE event is emitted.',
  })
  async sendMessage(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.chatService.streamAgentReply({
        sessionId,
        userId: user.id,
        userEmail: user.email,
        message: dto,
      })) {
        this.writeSseEvent(res, event);
      }
      res.write(`event: done\ndata: {}\n\n`);
    } catch (err) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          message: (err as Error).message,
        })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  /**
   * Manual finalize fallback. Kept for resilience: if the inline auto-finalize
   * inside `sendMessage` failed (LLM error, downstream incident creation
   * crash, network glitch), the user can retry without re-sending the chat.
   */
  @Post('sessions/:id/finalize')
  @RequirePermission(Permission.INCIDENTS_CREATE)
  @ApiOperation({
    summary:
      'Manually finalize the intake (fallback when auto-finalize failed)',
  })
  @ApiResponse({ status: 200, type: FinalizeResponseDto })
  async finalize(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FinalizeResponseDto> {
    const { incidentId } = await this.chatService.finalize(
      sessionId,
      user.id,
      user.email,
    );
    return { sessionId, incidentId };
  }

  @Get('sessions/:id')
  @RequirePermission(Permission.INCIDENTS_CREATE)
  @ApiOperation({ summary: 'Get a chat session with its full message history' })
  async getSession(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const session = await this.chatService.getSession(id, user.id);
    return {
      id: session.id,
      userId: session.userId,
      finalized: session.finalized,
      createdAt: session.createdAt,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /**
   * Maps a typed `ChatStreamEvent` to its SSE wire format. Centralized so
   * the frame format stays identical across all event variants.
   */
  private writeSseEvent(res: Response, event: ChatStreamEvent): void {
    switch (event.type) {
      case 'delta':
        res.write(`data: ${JSON.stringify({ delta: event.content })}\n\n`);
        break;
      case 'agent-done':
        res.write(`event: agent-done\ndata: {}\n\n`);
        break;
      case 'incident-created':
        res.write(
          `event: incident-created\ndata: ${JSON.stringify({
            incidentId: event.incidentId,
          })}\n\n`,
        );
        break;
      case 'finalize-error':
        res.write(
          `event: finalize-error\ndata: ${JSON.stringify({
            message: event.message,
          })}\n\n`,
        );
        break;
    }
  }
}
