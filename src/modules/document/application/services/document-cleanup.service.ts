import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { ErrorCode } from 'src/shared/common/errorCode';
import { CacheKey } from 'src/shared/domain/cacheKey';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { QueueName } from 'src/shared/infrastructure/queue/constant/queue-name';
import { IFileStorage } from 'src/shared/infrastructure/storage/file-storage.interface';
import {
  DocumentCleanupRepository,
  DocumentPurgePayload,
} from '../../infrastructure/document-cleanup.repo';

@Processor(QueueName.DocumentCleanupQueue, { concurrency: 3 })
export class DocumentCleanupService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(DocumentCleanupService.name);
  constructor(
    private readonly repository: DocumentCleanupRepository,
    private readonly storage: IFileStorage,
    @InjectQueue(QueueName.DocumentCleanupQueue) private readonly queue: Queue,
    private readonly cache: IApplicationCache,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // Propagate registration failure: startup must not silently omit retention cleanup.
    await this.queue.upsertJobScheduler(
      'document-cleanup-hourly-v1',
      { every: 3600000 },
      {
        name: 'scan',
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 60000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
    );
  }

  async process(job: Job<DocumentPurgePayload>): Promise<void> {
    if (job.name === 'scan') {
      let cursor = 0;
      for (;;) {
        const documents = await this.repository.scanExpired(cursor, 100);
        for (const document of documents) {
          const deletedAt = document.deletedAt.toISOString();
          await this.queue.add(
            'purge',
            { documentPublicId: document.publicId, deletedAt },
            {
              jobId: `purge-${document.publicId}-${document.deletedAt.getTime()}`,
              attempts: 5,
              backoff: { type: 'exponential', delay: 60000 },
              removeOnComplete: true,
              removeOnFail: true,
            },
          );
        }
        if (documents.length < 100) return;
        cursor = documents[documents.length - 1].id;
      }
    }
    if (job.name !== 'purge') throw new Error('Unknown document cleanup job');
    const snapshot = await this.repository.claimPurge(job.data);
    if (!snapshot) return;
    if (await this.repository.canDeleteStorageObject(snapshot.storagePath)) {
      const result = await this.storage.DeleteObject(snapshot.storagePath);
      if (result.isErr() && result.error.code !== ErrorCode.NotFound)
        throw result.error;
    }
    if (!(await this.repository.finalizePurge(job.data))) return;
    for (const key of [
      CacheKey.generateDocumentListVersionKey(snapshot.knowledgeSpacePublicId),
      CacheKey.generateSimilarChunksVersionKey(snapshot.knowledgeSpaceId),
    ]) {
      try {
        await this.cache.set(key, randomUUID(), 0);
      } catch {
        this.logger.warn(
          `Cache invalidation failed after purge ${snapshot.publicId}`,
        );
      }
    }
    this.logger.log(`Purged document ${snapshot.publicId}`);
  }
}
