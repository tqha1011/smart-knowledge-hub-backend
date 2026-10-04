import { Result } from 'neverthrow';

export type ChatAnswerSource = {
  documentPublicId: string;
  documentId: number;
  documentTitle: string;
  chunkId: number;
  content: string;
  score: number;
};

export type ChatAnswer =
  | { answered: true; content: string; sources: ChatAnswerSource[] }
  | { answered: false; reason: string };

export type ChatCacheOutcome = 'hit' | 'miss' | 'invalid' | 'error' | 'bypass';

export type ChatCacheDiagnostics = Partial<
  Record<'embedding' | 'publicChunks' | 'restrictedChunks', ChatCacheOutcome>
>;

export abstract class IChatAnswerService {
  abstract generateAnswer(
    knowledgeSpaceId: number,
    userId: number,
    question: string,
    diagnostics?: ChatCacheDiagnostics,
  ): Promise<Result<ChatAnswer, Error>>;
}
