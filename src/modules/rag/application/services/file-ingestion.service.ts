// import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
// import { Logger } from '@nestjs/common';
// import { Job } from 'bullmq';
// import { IDocumentRepository } from 'src/modules/document/domain/repositories/document.repo.interface';
// import { CommonDocumentStatus } from 'src/shared/domain/enum';
// import { IngestionJobRequestDto } from 'src/shared/infrastructure/queue/types/ingestion-job.request.dto';
// import { IEmbeddingClient } from '../../domain/repositories/embedding-client.interface';
// import { ChunkingService } from './chunking-service';

// export class FileIngestionService extends WorkerHost {
//   private readonly logger = new Logger(FileIngestionService.name);
//   constructor(
//     private readonly documentRepository: IDocumentRepository,
//     private readonly chunkingService: ChunkingService,
//     private readonly embeddingClient: IEmbeddingClient,
//   ) {
//     super();
//   }
//   async process(
//     job: Job<IngestionJobRequestDto>,
//     token?: string,
//   ): Promise<any> {
//     this.logger.log('Processing file ingestion job.');
//     throw new Error('Method not implemented.');
//   }

//   /**
//    * Only marks the document permanently `Failed` once BullMQ has exhausted
//    * every configured retry attempt — a transient failure on an earlier
//    * attempt leaves it in `Processing` so the next attempt can still succeed.
//    */
//   @OnWorkerEvent('failed')
//   async onFailed(job: Job<IngestionJobRequestDto> | undefined): Promise<void> {
//     if (!job) {
//       return;
//     }
//     const attemptsConfigured = job.opts.attempts ?? 1;
//     if (job.attemptsMade < attemptsConfigured) {
//       return;
//     }

//     const documentResult =
//       await this.documentRepository.getDocumentIngestionDataByPublicId(
//         job.data.documentPublicId,
//       );
//     if (documentResult.isErr() || !documentResult.value) {
//       this.logger.error(
//         `Failed to resolve document ${job.data.documentPublicId} while marking ingestion as Failed`,
//       );
//       return;
//     }

//     await this.documentRepository.updateDocumentStatus(
//       documentResult.value.id,
//       CommonDocumentStatus.Failed,
//     );
//   }
// }
