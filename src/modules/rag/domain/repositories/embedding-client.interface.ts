import { Result } from 'neverthrow';

export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export abstract class IEmbeddingClient {
  abstract generateEmbeddings(
    texts: string[],
    taskType?: EmbeddingTaskType,
  ): Promise<Result<number[][], Error>>;
}
