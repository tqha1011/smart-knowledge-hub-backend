import { Result } from 'neverthrow';

export type ChatSessionIdData = {
  id: number;
  knowledgeSpaceId: number;
};
export abstract class IChatSessionRepository {
  abstract getSessionIdDataByPublicId(
    sessionPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<ChatSessionIdData | null, Error>>;
}
