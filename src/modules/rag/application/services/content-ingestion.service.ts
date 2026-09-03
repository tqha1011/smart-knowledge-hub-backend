import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IDocumentRepository } from 'src/modules/document/domain/repositories/document.repo.interface';
import { CommonDocumentStatus } from 'src/shared/domain/enum';
import { QueueName } from 'src/shared/infrastructure/queue/constant/queue-name';
import { IngestionJobRequestDto } from 'src/shared/infrastructure/queue/types/job.request.dto';
import {
  EmbeddingResult,
  IDocumentChunkRepository,
} from '../../domain/repositories/document-chunk.repo.interface';
import { IEmbeddingClient } from '../../domain/repositories/embedding-client.interface';
import { ChunkingService } from './chunking-service';
import { FileIngestionService } from './file-ingestion.service';

const EMBEDDING_BATCH_SIZE = 100;

@Processor(QueueName.IngestionQueue)
export class ContentIngestionService extends WorkerHost {
  private readonly logger = new Logger(ContentIngestionService.name);
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly embeddingService: IEmbeddingClient,
    private readonly documentChunkRepository: IDocumentChunkRepository,
    private readonly chunkService: ChunkingService,
    private readonly fileIngestionService: FileIngestionService,
  ) {
    super();
  }

  /**
   * Throws (rather than returning an error Result) on every failure path —
   * BullMQ only retries a job when `process()` throws/rejects; resolving
   * normally is always treated as success, even if the resolved value would
   * have been an `err(...)` Result. Marking the document `Failed` happens
   * separately in `onFailed`, only once retries are exhausted.
   */
  async process(job: Job<IngestionJobRequestDto>): Promise<void> {
    const documentResult =
      await this.documentRepository.getDocumentIngestionDataByPublicId(
        job.data.documentPublicId,
      );
    if (documentResult.isErr()) {
      this.logger.error(
        `Error retrieving document ingestion data: ${documentResult.error}`,
      );
      throw documentResult.error;
    }
    if (!documentResult.value) {
      throw new Error(
        `Document with public ID ${job.data.documentPublicId} not found`,
      );
    }
    const document = documentResult.value;

    let text: string;
    if (document.content !== null) {
      text = document.content;
    } else {
      const extractResult = await this.fileIngestionService.extractText(
        document.storagePath,
        document.fileType,
      );
      if (extractResult.isErr()) {
        this.logger.error(
          `Error extracting file content for document ${job.data.documentPublicId}: ${extractResult.error}`,
        );
        throw extractResult.error;
      }
      text = extractResult.value;
    }

    const chunks = this.chunkService.chunkText(text);
    if (chunks.length === 0) {
      throw new Error(
        `Document with public ID ${job.data.documentPublicId} produced no chunks`,
      );
    }

    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const texts = batch.map((chunk) => chunk.content);
      const embeddingsResult =
        await this.embeddingService.generateEmbeddings(texts);
      if (embeddingsResult.isErr()) {
        this.logger.error(
          `Error generating embeddings for document ${job.data.documentPublicId}: ${embeddingsResult.error}`,
        );
        throw embeddingsResult.error;
      }
      vectors.push(...embeddingsResult.value);
    }

    const embeddingResults: EmbeddingResult[] = chunks.map((chunk, i) => ({
      chunkIndex: chunk.chunkIndex,
      embedding: vectors[i],
      content: chunk.content,
      tokens: chunk.tokens,
    }));

    const addChunksResult = await this.documentChunkRepository.addChunks({
      documentId: document.id,
      knowledgeSpaceId: document.knowledgeSpaceId,
      embeddingResult: embeddingResults,
    });
    if (addChunksResult.isErr()) {
      this.logger.error(
        `Error saving chunks for document ${job.data.documentPublicId}: ${addChunksResult.error}`,
      );
      throw addChunksResult.error;
    }

    const statusResult = await this.documentRepository.updateDocumentStatus(
      document.id,
      CommonDocumentStatus.Ready,
    );
    if (statusResult.isErr()) {
      this.logger.error(
        `Error updating status to Ready for document ${job.data.documentPublicId}: ${statusResult.error}`,
      );
      throw statusResult.error;
    }
  }

  /**
   * Only marks the document permanently `Failed` once BullMQ has exhausted
   * every configured retry attempt — a transient failure on an earlier
   * attempt leaves it in `Processing` so the next attempt can still succeed.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<IngestionJobRequestDto> | undefined): Promise<void> {
    if (!job) {
      return;
    }
    const attemptsConfigured = job.opts.attempts ?? 1;
    if (job.attemptsMade < attemptsConfigured) {
      return;
    }

    const documentResult =
      await this.documentRepository.getDocumentIngestionDataByPublicId(
        job.data.documentPublicId,
      );
    if (documentResult.isErr() || !documentResult.value) {
      this.logger.error(
        `Failed to resolve document ${job.data.documentPublicId} while marking ingestion as Failed`,
      );
      return;
    }

    await this.documentRepository.updateDocumentStatus(
      documentResult.value.id,
      CommonDocumentStatus.Failed,
    );
  }
}
