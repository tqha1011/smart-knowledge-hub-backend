import { Result } from 'neverthrow';

export type DocumentChunkAddData = {
  documentId: number;
  knowledgeSpaceId: number;
  embeddingResult: EmbeddingResult[];
};

export type EmbeddingResult = {
  chunkIndex: number;
  embedding: number[];
  content: string;
  tokens: number;
};

export type SimilarChunk = {
  chunkId: number;
  documentId: number;
  documentPublicId: string;
  documentTitle: string;
  content: string;
  score: number;
};

export abstract class IDocumentChunkRepository {
  abstract addChunks(
    data: DocumentChunkAddData,
  ): Promise<Result<undefined, Error>>;

  /**
   * Restricted to Ready documents the user can see: Public, or Restricted
   * with an explicit DocumentPermission row for userId.
   */
  abstract searchSimilarChunks(
    knowledgeSpaceId: number,
    userId: number,
    queryEmbedding: number[],
    topK: number,
  ): Promise<Result<SimilarChunk[], Error>>;
}
