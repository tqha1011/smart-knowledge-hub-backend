import { Module } from '@nestjs/common';
import { DocumentModule } from 'src/modules/document/document.module';
import { DocxParserService } from 'src/shared/infrastructure/parser/docx-parser.service';
import { PDFParserService } from 'src/shared/infrastructure/parser/pdf-parser.service';
import { StorageModule } from 'src/shared/infrastructure/storage/storage.module';
import { ChunkingService } from './application/services/chunking-service';
import { ContentIngestionService } from './application/services/content-ingestion.service';
import { FileIngestionService } from './application/services/file-ingestion.service';
import { IDocumentChunkRepository } from './domain/repositories/document-chunk.repo.interface';
import { IEmbeddingClient } from './domain/repositories/embedding-client.interface';
import { DocumentChunkRepository } from './infrastructure/document-chunk.repo';
import { GeminiEmbeddingClient } from './infrastructure/gemini-embedding.client';

@Module({
  imports: [DocumentModule, StorageModule],
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
    ChunkingService,
    FileIngestionService,
    ContentIngestionService,
    DocxParserService,
    PDFParserService,
  ],
  exports: [IDocumentChunkRepository, IEmbeddingClient],
})
export class RagModule {}
