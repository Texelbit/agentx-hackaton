import { Injectable } from '@nestjs/common';
import {
  ChatMessage,
  ChatMessageRole,
  ChatSession,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type ChatSessionWithMessages = Prisma.ChatSessionGetPayload<{
  include: { messages: true };
}>;

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  createSession(userId: string): Promise<ChatSession> {
    return this.prisma.chatSession.create({ data: { userId } });
  }

  findSession(id: string): Promise<ChatSessionWithMessages | null> {
    return this.prisma.chatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  appendMessage(args: {
    sessionId: string;
    role: ChatMessageRole;
    content: string;
    attachments?: unknown;
  }): Promise<ChatMessage> {
    return this.prisma.chatMessage.create({
      data: {
        sessionId: args.sessionId,
        role: args.role,
        content: args.content,
        attachments: args.attachments as Prisma.InputJsonValue | undefined,
      },
    });
  }

  markFinalized(id: string): Promise<ChatSession> {
    return this.prisma.chatSession.update({
      where: { id },
      data: { finalized: true },
    });
  }
}
