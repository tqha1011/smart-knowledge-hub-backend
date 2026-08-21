import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IDocumentRepository } from 'src/modules/document/domain/repositories/document.repo.interface';
import { CommonDocumentStatus } from 'src/shared/domain/enum';
import { IngestionJobRequestDto } from 'src/shared/infrastructure/queue/types/ingestion-job.request.dto';
import { IFileStorage } from 'src/shared/infrastructure/storage/file-storage.interface';
import { IEmbeddingClient } from '../../domain/repositories/embedding-client.interface';
import { ChunkingService } from './chunking-service';

export class FileIngestionService extends WorkerHost {
  private readonly logger = new Logger(FileIngestionService.name);
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingClient: IEmbeddingClient,
    private readonly fileStorage: IFileStorage,
  ) {
    super();
  }
  async process(job: Job<IngestionJobRequestDto>): Promise<void> {
    this.logger.log('Processing file ingestion job.');
    try {
      const document =
        await this.documentRepository.getDocumentIngestionDataByPublicId(
          job.data.documentPublicId,
        );
      if (document.isErr()) {
        this.logger.error(
          `Error retrieving document ingestion data: ${document.error}`,
        );
        throw document.error;
      }
      if (!document.value) {
        throw new Error(
          `Document with public ID ${job.data.documentPublicId} not found`,
        );
      }

      const fileBufferResult = await this.fileStorage.GetObject(
        document.value.storagePath,
      );
      if (fileBufferResult.isErr()) {
        this.logger.error(
          `Error retrieving file from storage: ${fileBufferResult.error}`,
        );
        throw fileBufferResult.error;
      }
    } catch (error) {
      this.logger.error(`Error processing file ingestion job: ${error}`);
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
