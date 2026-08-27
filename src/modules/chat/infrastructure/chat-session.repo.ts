import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  ChatSessionIdData,
  IChatSessionRepository,
} from '../domain/repositories/chat-session.repo.interface';

export class ChatSessionRepository implements IChatSessionRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async getSessionIdDataByPublicId(
    sessionPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<ChatSessionIdData | null, Error>> {
    try {
      const sessionIdData: ChatSessionIdData | null =
        await this.prismaService.chatSession.findUnique({
          where: {
            publicId: sessionPublicId,
            knowledgeSpace: {
              publicId: knowledgeSpacePublicId,
            },
          },
          select: {
            id: true,
            knowledgeSpaceId: true,
          },
        });
      return ok(sessionIdData);
    } catch (error) {
      return err(
        new Error(`Failed to get session ID data by public ID: ${error}`),
      );
    }
  }
}
