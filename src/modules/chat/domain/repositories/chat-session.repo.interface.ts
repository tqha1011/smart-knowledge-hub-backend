import { Result } from 'neverthrow';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import {
  ChatSessionDetailData,
  ChatSessionListData,
  CreatedChatSessionData,
} from '../../application/dtos/chat-session.response.dto';

export type ChatSessionIdData = {
  id: number;
  knowledgeSpaceId: number;
};

export type ChatSessionDetailRecord = ChatSessionDetailData & {
  id: number;
};
export abstract class IChatSessionRepository {
  abstract getSessionIdDataByPublicId(
    sessionPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<ChatSessionIdData | null, Error>>;

  abstract createSession(
    userId: number,
    knowledgeSpaceId: number,
    title: string,
  ): Promise<Result<CreatedChatSessionData, Error>>;

  /** Resolves `false` (instead of an err) when no session matches the given
   * public ID, user and knowledge space, so callers can distinguish a
   * not-found/wrong-owner case from an actual failure. */
  abstract softDeleteSession(
    sessionPublicId: string,
    userId: number,
    knowledgeSpaceId: number,
  ): Promise<Result<boolean, Error>>;

  abstract getSessionsForUser(
    userId: number,
    knowledgeSpaceId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<ChatSessionListData>, Error>>;

  abstract getSessionDetail(
    sessionPublicId: string,
    userId: number,
    knowledgeSpaceId: number,
  ): Promise<Result<ChatSessionDetailRecord | null, Error>>;
}
