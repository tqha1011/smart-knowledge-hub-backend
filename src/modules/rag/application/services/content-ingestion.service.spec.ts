import { Job } from 'bullmq';
import { err, ok } from 'neverthrow';
import {
  CommonDocumentStatus,
  CommonDocumentType,
  CommonDocumentVisibility,
} from 'src/shared/domain/enum';
import { ContentIngestionService } from './content-ingestion.service';

function createDeps() {
  return {
    documentRepository: {
      getDocumentIngestionDataByPublicId: jest.fn(),
      updateDocumentStatus: jest.fn(),
    },
    embeddingService: { generateEmbeddings: jest.fn() },
    documentChunkRepository: { addChunks: jest.fn() },
    chunkService: { chunkText: jest.fn() },
    fileIngestionService: { extractText: jest.fn() },
    realtimeNotifier: { notifyDocumentStatus: jest.fn() },
  };
}

function createService(deps: ReturnType<typeof createDeps>) {
  return new ContentIngestionService(
    deps.documentRepository as any,
    deps.embeddingService,
    deps.documentChunkRepository as any,
    deps.chunkService,
    deps.fileIngestionService as any,
    deps.realtimeNotifier,
  );
}

const baseDocument = {
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
      deps.documentChunkRepository.addChunks.mockResolvedValue(ok(undefined));
      deps.documentRepository.updateDocumentStatus.mockResolvedValue(
        ok(undefined),
      );
      const service = createService(deps);

      await service.process({
        data: { documentPublicId: 'doc-public-id' },
      } as Job<any>);

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
      deps.documentChunkRepository.addChunks.mockResolvedValue(ok(undefined));
      deps.documentRepository.updateDocumentStatus.mockResolvedValue(
        err(new Error('db down')),
      );
      const service = createService(deps);

      await expect(
        service.process({
          data: { documentPublicId: 'doc-public-id' },
        } as Job<any>),
      ).rejects.toThrow();
      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('notifies Failed once retries are exhausted and the status update succeeds', async () => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.documentRepository.updateDocumentStatus.mockResolvedValue(
        ok(undefined),
      );
      const service = createService(deps);
      const job = {
        data: { documentPublicId: 'doc-public-id' },
        opts: { attempts: 1 },
        attemptsMade: 1,
      } as unknown as Job<any>;

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
        data: { documentPublicId: 'doc-public-id' },
        opts: { attempts: 3 },
        attemptsMade: 1,
      } as unknown as Job<any>;

      await service.onFailed(job);

      expect(
        deps.documentRepository.getDocumentIngestionDataByPublicId,
      ).not.toHaveBeenCalled();
      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
    });

    it('does not notify when the status update itself fails', async () => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.documentRepository.updateDocumentStatus.mockResolvedValue(
        err(new Error('db down')),
      );
      const service = createService(deps);
      const job = {
        data: { documentPublicId: 'doc-public-id' },
        opts: { attempts: 1 },
        attemptsMade: 1,
      } as unknown as Job<any>;

      await service.onFailed(job);

      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
    });
  });
});
