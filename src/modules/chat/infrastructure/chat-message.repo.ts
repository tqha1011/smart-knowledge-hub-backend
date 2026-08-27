import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { ChatMessage } from '../domain/entities/chat-message.entity';
import { IChatMessageRepository } from '../domain/repositories/chat-message.repo.interface';
import { toPrismaRole } from './chat-message.mapper';

export class ChatMessageRepository implements IChatMessageRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async addMessage(newMessage: ChatMessage): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.chatMessage.create({
        data: {
          chatSessionId: newMessage.chatSessionId,
          role: toPrismaRole(newMessage.role),
          content: newMessage.content,
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to add chat message: ${error}`));
    }
  }
}
