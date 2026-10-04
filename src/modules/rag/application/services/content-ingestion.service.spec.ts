import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { err, ok } from 'neverthrow';
import {
  CommonDocumentStatus,
  CommonDocumentType,
  CommonDocumentVisibility,
} from 'src/shared/domain/enum';
import { IDocumentRepository } from 'src/modules/document/domain/repositories/document.repo.interface';
import { IDocumentChunkRepository } from '../../domain/repositories/document-chunk.repo.interface';
import { FileIngestionService } from './file-ingestion.service';
import { IngestionJobRequestDto } from 'src/shared/infrastructure/queue/types/job.request.dto';
import { ContentIngestionService } from './content-ingestion.service';

function createDeps() {
  return {
    documentRepository: {
      getDocumentIngestionDataByPublicId: jest.fn(),
      transitionDocumentStatus: jest.fn(),
    },
    embeddingService: { generateEmbeddings: jest.fn() },
    documentChunkRepository: { addChunks: jest.fn() },
    chunkService: { chunkText: jest.fn() },
    fileIngestionService: { extractText: jest.fn() },
    realtimeNotifier: { notifyDocumentStatus: jest.fn() },
    cache: {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn(),
    },
  };
}

function createService(deps: ReturnType<typeof createDeps>) {
  return new ContentIngestionService(
    deps.documentRepository as unknown as IDocumentRepository,
    deps.embeddingService,
    deps.documentChunkRepository as unknown as IDocumentChunkRepository,
    deps.chunkService,
    deps.fileIngestionService as unknown as FileIngestionService,
    deps.realtimeNotifier,
    deps.cache,
  );
}

const baseDocument = {
  updatedAt: new Date('2026-10-04T12:00:00Z'),
  id: 42,
  knowledgeSpaceId: 7,
  knowledgeSpacePublicId: 'ks-public-id',
  storagePath: 'docs/42.pdf',
  fileName: 'Handbook.pdf',
  content: 'plain text content',
  status: CommonDocumentStatus.Processing,
  visibility: CommonDocumentVisibility.Public,
  fileType: CommonDocumentType.TXT,
};

describe('ContentIngestionService', () => {
  let warning: jest.SpyInstance;
  beforeEach(() => {
    warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(['Ready', 'Failed'])(
    'awaits %s invalidation after persistence and before realtime',
    async (status) => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.chunkService.chunkText.mockReturnValue([
        { chunkIndex: 0, content: 'chunk', tokens: 3 },
      ]);
      deps.embeddingService.generateEmbeddings.mockResolvedValue(ok([[0.1]]));
      deps.documentChunkRepository.addChunks.mockResolvedValue(
        ok(baseDocument.updatedAt),
      );
      deps.documentRepository.transitionDocumentStatus.mockImplementation(
        () => {
          expect(deps.cache.set).not.toHaveBeenCalled();
          return Promise.resolve(ok(baseDocument.updatedAt));
        },
      );
      let release!: () => void;
      let started!: () => void;
      const invalidating = new Promise<void>((resolve) => {
        started = resolve;
      });
      deps.cache.set.mockImplementationOnce(() => {
        started();
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      });
      const service = createService(deps);
      const job = {
        data: {
          documentPublicId: 'doc-public-id',
          expectedUpdatedAt: baseDocument.updatedAt.toISOString(),
        },
        opts: { attempts: 1 },
        attemptsMade: 1,
      } as Job<IngestionJobRequestDto>;
      const pending =
        status === 'Ready' ? service.process(job) : service.onFailed(job);
      // Also allow the pre-implementation path to finish, so missing invalidation fails without timing out.
      await Promise.race([invalidating, pending]);
      expect(deps.cache.set).toHaveBeenCalledWith(
        'document-list:ks-public-id:version',
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        0,
      );
      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
      release();
      await pending;
      expect(deps.cache.set).toHaveBeenCalledWith(
        'rag:similar-chunks:version:7',
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        0,
      );
      expect(deps.realtimeNotifier.notifyDocumentStatus).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status }),
      );
    },
  );

  it.each(['Ready', 'Failed'])(
    'still notifies %s when invalidation fails',
    async (status) => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.chunkService.chunkText.mockReturnValue([
        { chunkIndex: 0, content: 'chunk', tokens: 3 },
      ]);
      deps.embeddingService.generateEmbeddings.mockResolvedValue(ok([[0.1]]));
      deps.documentChunkRepository.addChunks.mockResolvedValue(
        ok(baseDocument.updatedAt),
      );
      deps.documentRepository.transitionDocumentStatus.mockResolvedValue(
        ok(baseDocument.updatedAt),
      );
      deps.cache.set.mockRejectedValue(new Error('Redis unavailable'));
      const service = createService(deps);
      const job = {
        data: {
          documentPublicId: 'doc-public-id',
          expectedUpdatedAt: baseDocument.updatedAt.toISOString(),
        },
        opts: { attempts: 1 },
        attemptsMade: 1,
      } as Job<IngestionJobRequestDto>;
      await (status === 'Ready' ? service.process(job) : service.onFailed(job));
      expect(warning).toHaveBeenCalled();
      expect(deps.realtimeNotifier.notifyDocumentStatus).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status }),
      );
    },
  );

  describe('version fence', () => {
    function setup() {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.chunkService.chunkText.mockReturnValue([
        { chunkIndex: 0, content: 'chunk', tokens: 3 },
      ]);
      deps.embeddingService.generateEmbeddings.mockResolvedValue(ok([[0.1]]));
      deps.documentChunkRepository.addChunks.mockResolvedValue(
        ok(baseDocument.updatedAt),
      );
      return { deps, service: createService(deps) };
    }
    it('persists legacy snapshot before extraction and reuses it on retry', async () => {
      const { deps, service } = setup();
      const updateData = jest.fn().mockResolvedValue(undefined);
      const job = {
        data: { documentPublicId: 'doc' },
        updateData,
      } as unknown as Job<IngestionJobRequestDto>;
      await service.process(job);
      expect(updateData).toHaveBeenCalledWith({
        documentPublicId: 'doc',
        expectedUpdatedAt: baseDocument.updatedAt.toISOString(),
      });
      expect(deps.documentChunkRepository.addChunks).toHaveBeenCalledWith(
        expect.objectContaining({ expectedUpdatedAt: baseDocument.updatedAt }),
      );
    });
    it('retries rather than writing when legacy snapshot cannot be saved', async () => {
      const { deps, service } = setup();
      await expect(
        service.process({
          data: { documentPublicId: 'doc' },
          updateData: jest
            .fn()
            .mockRejectedValue(new Error('Redis unavailable')),
        } as unknown as Job<IngestionJobRequestDto>),
      ).rejects.toThrow('Redis unavailable');
      expect(deps.embeddingService.generateEmbeddings).not.toHaveBeenCalled();
      expect(deps.documentChunkRepository.addChunks).not.toHaveBeenCalled();
    });
    it.each([
      null,
      { ...baseDocument, status: CommonDocumentStatus.Ready },
      {
        ...baseDocument,
        updatedAt: new Date(baseDocument.updatedAt.getTime() + 1),
      },
    ])(
      'skips obsolete, inactive or complete snapshots %j',
      async (document) => {
        const { deps, service } = setup();
        deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
          ok(document),
        );
        await service.process({
          data: {
            documentPublicId: 'doc',
            expectedUpdatedAt: baseDocument.updatedAt.toISOString(),
          },
        } as Job<IngestionJobRequestDto>);
        expect(deps.documentChunkRepository.addChunks).not.toHaveBeenCalled();
        expect(deps.embeddingService.generateEmbeddings).not.toHaveBeenCalled();
      },
    );
    it('does not notify when delete or edit wins during embedding', async () => {
      const { deps, service } = setup();
      deps.documentChunkRepository.addChunks.mockResolvedValue(ok(null));
      await service.process({
        data: {
          documentPublicId: 'doc',
          expectedUpdatedAt: baseDocument.updatedAt.toISOString(),
        },
      } as Job<IngestionJobRequestDto>);
      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
      expect(deps.cache.set).not.toHaveBeenCalled();
    });
    it('does not mark a newer retry Failed or notify when an old job exhausts attempts', async () => {
      const { deps, service } = setup();
      deps.documentRepository.transitionDocumentStatus.mockResolvedValue(
        ok(null),
      );
      await service.onFailed({
        data: {
          documentPublicId: 'doc',
          expectedUpdatedAt: baseDocument.updatedAt.toISOString(),
        },
        opts: { attempts: 3 },
        attemptsMade: 3,
      } as Job<IngestionJobRequestDto>);
      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
    });
  });

  describe('process', () => {
    it('notifies Ready after the document status update succeeds', async () => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.chunkService.chunkText.mockReturnValue([
        { chunkIndex: 0, content: 'chunk', tokens: 3 },
      ]);
      deps.embeddingService.generateEmbeddings.mockResolvedValue(
        ok([[0.1, 0.2]]),
      );
      deps.documentChunkRepository.addChunks.mockResolvedValue(
        ok(baseDocument.updatedAt),
      );
      deps.documentRepository.transitionDocumentStatus.mockResolvedValue(
        ok(baseDocument.updatedAt),
      );
      const service = createService(deps);

      await service.process({
        data: {
          documentPublicId: 'doc-public-id',
          expectedUpdatedAt: baseDocument.updatedAt.toISOString(),
        },
      } as Job<IngestionJobRequestDto>);

      expect(deps.realtimeNotifier.notifyDocumentStatus).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          documentPublicId: 'doc-public-id',
          knowledgeSpacePublicId: 'ks-public-id',
          fileName: 'Handbook.pdf',
          status: 'Ready',
        }),
      );
    });

    it('does not notify when the status update fails', async () => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.chunkService.chunkText.mockReturnValue([
        { chunkIndex: 0, content: 'chunk', tokens: 3 },
      ]);
      deps.embeddingService.generateEmbeddings.mockResolvedValue(
        ok([[0.1, 0.2]]),
      );
      deps.documentChunkRepository.addChunks.mockResolvedValue(
        ok(baseDocument.updatedAt),
      );
      deps.documentChunkRepository.addChunks.mockResolvedValue(
        err(new Error('db down')),
      );
      const service = createService(deps);

      await expect(
        service.process({
          data: {
            documentPublicId: 'doc-public-id',
            expectedUpdatedAt: baseDocument.updatedAt.toISOString(),
          },
        } as Job<IngestionJobRequestDto>),
      ).rejects.toThrow();
      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
      expect(deps.cache.set).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('notifies Failed once retries are exhausted and the status update succeeds', async () => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.documentRepository.transitionDocumentStatus.mockResolvedValue(
        ok(baseDocument.updatedAt),
      );
      const service = createService(deps);
      const job = {
        data: {
          documentPublicId: 'doc-public-id',
          expectedUpdatedAt: baseDocument.updatedAt.toISOString(),
        },
        opts: { attempts: 1 },
        attemptsMade: 1,
      } as unknown as Job<IngestionJobRequestDto>;

      await service.onFailed(job);

      expect(deps.realtimeNotifier.notifyDocumentStatus).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          status: 'Failed',
          documentPublicId: 'doc-public-id',
          knowledgeSpacePublicId: 'ks-public-id',
        }),
      );
    });

    it('does not notify when retries are not yet exhausted', async () => {
      const deps = createDeps();
      const service = createService(deps);
      const job = {
        data: {
          documentPublicId: 'doc-public-id',
          expectedUpdatedAt: baseDocument.updatedAt.toISOString(),
        },
        opts: { attempts: 3 },
        attemptsMade: 1,
      } as unknown as Job<IngestionJobRequestDto>;

      await service.onFailed(job);

      expect(
        deps.documentRepository.getDocumentIngestionDataByPublicId,
      ).not.toHaveBeenCalled();
      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
      expect(deps.cache.set).not.toHaveBeenCalled();
    });

    it('does not notify when the status update itself fails', async () => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.documentRepository.transitionDocumentStatus.mockResolvedValue(
        err(new Error('db down')),
      );
      const service = createService(deps);
      const job = {
        data: {
          documentPublicId: 'doc-public-id',
          expectedUpdatedAt: baseDocument.updatedAt.toISOString(),
        },
        opts: { attempts: 1 },
        attemptsMade: 1,
      } as unknown as Job<IngestionJobRequestDto>;

      await service.onFailed(job);

      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
      expect(deps.cache.set).not.toHaveBeenCalled();
    });
  });
});
