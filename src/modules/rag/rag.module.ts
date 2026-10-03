import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentModule } from 'src/modules/document/document.module';
import { DocxParserService } from 'src/shared/infrastructure/parser/docx-parser.service';
import { PDFParserService } from 'src/shared/infrastructure/parser/pdf-parser.service';
import { StorageModule } from 'src/shared/infrastructure/storage/storage.module';
import { ChunkingService } from './application/services/chunking-service';
import { ContentIngestionService } from './application/services/content-ingestion.service';
import { FileIngestionService } from './application/services/file-ingestion.service';
import { IAnswerGenerationClient } from './domain/repositories/answer-generation-client.interface';
import { IDocumentChunkRepository } from './domain/repositories/document-chunk.repo.interface';
import { IEmbeddingClient } from './domain/repositories/embedding-client.interface';
import { DocumentChunkRepository } from './infrastructure/document-chunk.repo';
import { GeminiEmbeddingClient } from './infrastructure/gemini-embedding.client';
import { GroqChatClient } from './infrastructure/groq-chat.client';
import {
  MockAnswerGenerationClient,
  MockEmbeddingClient,
} from './infrastructure/mock-ai.clients';

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
      useFactory: (config: ConfigService): IEmbeddingClient =>
        config.get<string>('LOAD_TEST_MOCK_AI') === 'true'
          ? new MockEmbeddingClient()
          : new GeminiEmbeddingClient(config),
      inject: [ConfigService],
    },
    {
      provide: IAnswerGenerationClient,
      useFactory: (config: ConfigService): IAnswerGenerationClient =>
        config.get<string>('LOAD_TEST_MOCK_AI') === 'true'
          ? new MockAnswerGenerationClient()
          : new GroqChatClient(config),
      inject: [ConfigService],
    },
    ChunkingService,
    FileIngestionService,
    ContentIngestionService,
    DocxParserService,
    PDFParserService,
  ],
  exports: [
    IDocumentChunkRepository,
    IEmbeddingClient,
    IAnswerGenerationClient,
  ],
})
export class RagModule {}
