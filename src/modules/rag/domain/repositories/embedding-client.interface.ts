import { Result } from 'neverthrow';

export abstract class IEmbeddingClient {
  abstract generateEmbeddings(
    texts: string[],
  ): Promise<Result<number[][], Error>>;
}
