import { Result } from 'neverthrow';

export type DocumentChunkAddData = {
  documentId: number;
  knowledgeSpaceId: number;
  embeddingResult: EmbeddingResult[];
  expectedUpdatedAt: Date;
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
  visibility: 'Public' | 'Restricted';
};

export type SimilarChunkScopes = { public: boolean; restricted: boolean };

export abstract class IDocumentChunkRepository {
  abstract validateSimilarChunks(
    spaceId: number,
    userId: number,
    chunks: SimilarChunk[],
  ): Promise<Result<SimilarChunk[], Error>>;

  abstract addChunks(
    data: DocumentChunkAddData,
  ): Promise<Result<Date | null, Error>>;

  /** Returns up to topK Ready chunks per requested visibility. */
  abstract searchSimilarChunks(
    knowledgeSpaceId: number,
    userId: number,
    queryEmbedding: number[],
    topK: number,
    scopes: SimilarChunkScopes,
  ): Promise<Result<SimilarChunk[], Error>>;
}
