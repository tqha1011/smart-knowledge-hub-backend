import { Module } from '@nestjs/common';
import { IDocumentChunkRepository } from './domain/repositories/document-chunk.repo.interface';
import { IEmbeddingClient } from './domain/repositories/embedding-client.interface';
import { DocumentChunkRepository } from './infrastructure/document-chunk.repo';
import { GeminiEmbeddingClient } from './infrastructure/gemini-embedding.client';

@Module({
  imports: [],
  controllers: [],
  providers: [
    {
      provide: IDocumentChunkRepository,
      useClass: DocumentChunkRepository,
    },
    {
      provide: IEmbeddingClient,
      useClass: GeminiEmbeddingClient,
    },
  ],
  exports: [IDocumentChunkRepository, IEmbeddingClient],
})
export class RagModule {}
