import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { IFileStorage } from 'src/shared/infrastructure/storage/file-storage.interface';
import {
  DocumentCleanupRepository,
  DocumentPurgePayload,
} from '../../infrastructure/document-cleanup.repo';
import { DocumentCleanupService } from './document-cleanup.service';

const deletedAt = '2026-09-01T00:00:00.000Z';
const snapshot = {
  id: 42,
  publicId: 'doc',
  storagePath: 'key',
  knowledgeSpaceId: 7,
  knowledgeSpacePublicId: 'space',
};
function setup() {
  const repository = {
    scanExpired: jest.fn().mockResolvedValue([]),
    claimPurge: jest.fn().mockResolvedValue(snapshot),
    canDeleteStorageObject: jest.fn().mockResolvedValue(true),
    finalizePurge: jest.fn().mockResolvedValue(true),
  };
  const storage = { DeleteObject: jest.fn().mockResolvedValue(ok(undefined)) };
  const queue = {
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
  };
  const cache = { set: jest.fn().mockResolvedValue(undefined) };
  const service = new DocumentCleanupService(
    repository as unknown as DocumentCleanupRepository,
    storage as unknown as IFileStorage,
    queue as unknown as Queue,
    cache as unknown as IApplicationCache,
  );
  const purge = () =>
    service.process({
      name: 'purge',
      data: { documentPublicId: 'doc', deletedAt },
    } as Job<DocumentPurgePayload>);
  return { repository, storage, queue, cache, service, purge };
}
describe('document cleanup worker', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  it('registers one hourly scheduler and fails startup when registration fails', async () => {
    const { service, queue } = setup();
    await service.onModuleInit();
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'document-cleanup-hourly-v1',
      { every: 3600000 },
      {
        name: 'scan',
        data: {},
        opts: expect.objectContaining({ attempts: 3 }) as object,
      },
    );
    queue.upsertJobScheduler.mockRejectedValueOnce(new Error('Redis down'));
    await expect(service.onModuleInit()).rejects.toThrow('Redis down');
  });
  it('scans cursor batches of 100 and enqueues generation-specific purge jobs', async () => {
    const { service, repository, queue } = setup();
    repository.scanExpired
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          publicId: `doc-${i}`,
          deletedAt: new Date(deletedAt),
        })),
      )
      .mockResolvedValueOnce([
        { id: 101, publicId: 'last', deletedAt: new Date(deletedAt) },
      ]);
    await service.process({ name: 'scan' } as Job<DocumentPurgePayload>);
    expect(repository.scanExpired).toHaveBeenNthCalledWith(1, 0, 100);
    expect(repository.scanExpired).toHaveBeenNthCalledWith(2, 100, 100);
    expect(queue.add).toHaveBeenCalledTimes(101);
    expect(queue.add).toHaveBeenLastCalledWith(
      'purge',
      { documentPublicId: 'last', deletedAt },
      {
        jobId: expect.stringContaining('last-') as string,
        attempts: 5,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });
  it('skips restored, superseded and completed deletions without contacting R2', async () => {
    const { purge, repository, storage } = setup();
    repository.claimPurge.mockResolvedValueOnce(null);
    await purge();
    expect(storage.DeleteObject).not.toHaveBeenCalled();
    expect(repository.finalizePurge).not.toHaveBeenCalled();
  });
  it('commits claim before deleting R2 and finalizes after storage succeeds', async () => {
    const { purge, repository, storage, cache } = setup();
    await purge();
    expect(repository.claimPurge.mock.invocationCallOrder[0]).toBeLessThan(
      storage.DeleteObject.mock.invocationCallOrder[0],
    );
    expect(storage.DeleteObject.mock.invocationCallOrder[0]).toBeLessThan(
      repository.finalizePurge.mock.invocationCallOrder[0],
    );
    expect(cache.set).toHaveBeenCalledTimes(2);
  });
  it('retries on R2 error without clearing claim or finalizing', async () => {
    const { purge, repository, storage } = setup();
    storage.DeleteObject.mockResolvedValueOnce(
      err(new AppError(ErrorCode.InternalServerError, 'R2 down')),
    );
    await expect(purge()).rejects.toThrow('R2 down');
    expect(repository.finalizePurge).not.toHaveBeenCalled();
    await purge();
    expect(repository.finalizePurge).toHaveBeenCalledTimes(1);
  });
  it('retries finalization after R2 success and tolerates a missing object', async () => {
    const { purge, repository, storage } = setup();
    repository.finalizePurge.mockRejectedValueOnce(new Error('DB down'));
    await expect(purge()).rejects.toThrow('DB down');
    storage.DeleteObject.mockResolvedValueOnce(
      err(new AppError(ErrorCode.NotFound, 'missing object')),
    );
    await purge();
    expect(repository.finalizePurge).toHaveBeenCalledTimes(2);
  });
  it('preserves a shared object while finalizing expired private data', async () => {
    const { purge, repository, storage } = setup();
    repository.canDeleteStorageObject.mockResolvedValueOnce(false);
    await purge();
    expect(storage.DeleteObject).not.toHaveBeenCalled();
    expect(repository.finalizePurge).toHaveBeenCalledTimes(1);
  });
  it('does not retry completed purge only because cache invalidation failed', async () => {
    const { purge, cache } = setup();
    cache.set.mockRejectedValue(new Error('Redis down'));
    await expect(purge()).resolves.toBeUndefined();
  });
});
