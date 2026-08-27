import { Result } from 'neverthrow';

export type AnswerSourceInput = {
  messageId: number;
  documentId: number;
  knowledgeSpaceId: number;
  chunkId: number;
  score: number;
};

export abstract class IAnswerSourceRepository {
  abstract addAnswerSources(
    sources: AnswerSourceInput[],
  ): Promise<Result<undefined, Error>>;
}
