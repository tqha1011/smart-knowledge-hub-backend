import { Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { ChatMessageListData } from '../application/dtos/chat-session.response.dto';
import { ChatMessage } from '../domain/entities/chat-message.entity';
import {
  ChatMessagePersisted,
  IChatMessageRepository,
} from '../domain/repositories/chat-message.repo.interface';
import { toDomainRole, toPrismaRole } from './chat-message.mapper';

@Injectable()
export class ChatMessageRepository implements IChatMessageRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async addMessage(
    newMessage: ChatMessage,
  ): Promise<Result<ChatMessagePersisted, Error>> {
    try {
      const created = await this.prismaService.chatMessage.create({
        data: {
          publicId: newMessage.messagePublicId,
          chatSessionId: newMessage.chatSessionId,
          role: toPrismaRole(newMessage.role),
          content: newMessage.content,
        },
        select: { id: true },
      });
      return ok({ id: created.id });
    } catch (error) {
      return err(new Error(`Failed to add chat message: ${error}`));
    }
  }
  async getMessagesBySessionId(
    chatSessionId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<ChatMessageListData>, Error>> {
    try {
      const [messages, totalMessages] = await this.prismaService.$transaction([
        this.prismaService.chatMessage.findMany({
          where: { chatSessionId },
          select: {
            publicId: true,
            role: true,
            content: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
          skip: (pagination.pageNumber - 1) * pagination.pageSize,
          take: pagination.pageSize,
        }),
        this.prismaService.chatMessage.count({ where: { chatSessionId } }),
      ]);
      const messageList: ChatMessageListData[] = messages.map((message) => ({
        publicId: message.publicId,
        role: toDomainRole(message.role),
        content: message.content,
        createdAt: message.createdAt,
      }));
      return ok(
        new PageResult<ChatMessageListData>(
          messageList,
          totalMessages,
          pagination.pageNumber,
          pagination.pageNumber,
          pagination.pageSize,
        ),
      );
    } catch (error) {
      return err(new Error(`Failed to get chat messages: ${error}`));
    }
  }
}
