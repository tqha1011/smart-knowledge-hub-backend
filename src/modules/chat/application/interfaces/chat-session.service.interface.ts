import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import {
  ChatMessageListData,
  ChatSessionListData,
  CreatedChatSessionData,
} from '../dtos/chat-session.response.dto';

export type ChatSessionDetailWithMessages = {
  publicId: string;
  title: string;
  createdAt: Date;
  messages: PageResult<ChatMessageListData>;
};

export abstract class IChatSessionService {
  abstract createSessionAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<CreatedChatSessionData, AppError>>;

  /** Only the session's own owner may delete it. */
  abstract deleteSessionAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    sessionPublicId: string,
  ): Promise<Result<undefined, AppError>>;

  /** Lists the caller's own sessions in this knowledge space, most recently
   * updated first. */
  abstract getSessionsForUserAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<ChatSessionListData>, AppError>>;

  /** Only the session's own owner may view it. */
  abstract getSessionDetailAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    sessionPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<ChatSessionDetailWithMessages, AppError>>;
}
