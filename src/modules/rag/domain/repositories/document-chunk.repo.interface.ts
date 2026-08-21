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
export abstract class IDocumentChunkRepository {
  abstract addChunks(
    data: DocumentChunkAddData,
  ): Promise<Result<undefined, Error>>;
}
