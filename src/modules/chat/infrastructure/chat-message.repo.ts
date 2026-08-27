import { Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { ChatMessage } from '../domain/entities/chat-message.entity';
import {
  ChatMessagePersisted,
  IChatMessageRepository,
} from '../domain/repositories/chat-message.repo.interface';
import { toPrismaRole } from './chat-message.mapper';

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
}
