import { Result, err, ok } from 'neverthrow';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { CommonChatRole } from 'src/shared/domain/enum';
import { ChatMessage } from '../../domain/entities/chat-message.entity';
import { IChatMessageRepository } from '../../domain/repositories/chat-message.repo.interface';
import { IChatSessionRepository } from '../../domain/repositories/chat-session.repo.interface';
import { ChatMessageRequestDto } from '../dtos/chat-message.request.dto';
import { IChatMessageService } from '../interfaces/chat-message.service.interface';

export class ChatMessageService implements IChatMessageService {
  constructor(
    private readonly chatMessageRepository: IChatMessageRepository,
    private readonly chatSessionRepository: IChatSessionRepository,
  ) {}
  async chatAsync(
    request: ChatMessageRequestDto,
  ): Promise<Result<undefined, AppError>> {
    try {
      const checkIdResult =
        await this.chatSessionRepository.getSessionIdDataByPublicId(
          request.chatSessionPublicId,
          request.knowledgeSpacePublicId,
        );
      if (checkIdResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to check chat session ID.',
          ),
        );
      }
      if (checkIdResult.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Chat session not found.'));
      }

      const newMessage = ChatMessage.createChatMessage({
        chatSessionId: checkIdResult.value.id,
        role: CommonChatRole.User,
        content: request.content,
      });
      if (newMessage.isErr()) {
        return err(
          new AppError(ErrorCode.BadRequest, newMessage.error.message),
        );
      }
      const addMessageResult = await this.chatMessageRepository.addMessage(
        newMessage.value,
      );
      if (addMessageResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to add chat message.',
          ),
        );
      }
      return ok(undefined);
    } catch (error) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to add chat message. ${error}`,
        ),
      );
    }
  }
}
