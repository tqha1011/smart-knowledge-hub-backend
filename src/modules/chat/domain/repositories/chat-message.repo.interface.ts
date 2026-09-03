import { Result } from 'neverthrow';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { ChatMessageListData } from '../../application/dtos/chat-session.response.dto';
import { ChatMessage } from '../entities/chat-message.entity';

export type ChatMessagePersisted = {
  id: number;
};

export abstract class IChatMessageRepository {
  abstract addMessage(
    newMessage: ChatMessage,
  ): Promise<Result<ChatMessagePersisted, Error>>;

  /** Oldest first, so a page reads top-to-bottom like the conversation. */
  abstract getMessagesBySessionId(
    chatSessionId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<ChatMessageListData>, Error>>;
}
