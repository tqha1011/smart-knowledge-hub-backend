import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { err, ok, Result } from 'neverthrow';
import { ICategoryRepository } from 'src/modules/category/domain/repositories/category.repo.interface';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { PageResult } from 'src/shared/common/pagination';
import { ErrorCode } from 'src/shared/common/errorCode';
import {
  CommonDocumentStatus,
  CommonDocumentType,
  CommonDocumentVisibility,
  KnowledgeSpaceRole,
} from 'src/shared/domain/enum';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { QueueName } from 'src/shared/infrastructure/queue/constant/queue-name';
import { EventName } from 'src/shared/infrastructure/queue/constant/event-name';
import { IFileStorage } from 'src/shared/infrastructure/storage/file-storage.interface';
import { IDocumentRepository } from '../../domain/repositories/document.repo.interface';
import { IDocumentPermissionRepository } from '../../domain/repositories/document-permission.repo.interface';
import { IDocumentQueryRepository } from '../interfaces/document-query.repo.interface';
import { DocumentListResponseDto } from '../dtos/document.response.dto';
import { DocumentService } from './document.service';
import { Document } from '../../domain/entities/document.entity';
import { IRealtimeNotifier } from 'src/shared/infrastructure/notification/realtime-notifier.interface';

const item: DocumentListResponseDto = {
  publicId: 'doc',
  title: 'Guide.txt',
  fileType: CommonDocumentType.TXT,
  status: CommonDocumentStatus.Processing,
  visibility: CommonDocumentVisibility.Public,
  lastUpdated: new Date('2026-10-01T12:00:00Z'),
  category: { publicId: 'cat', name: 'Guides' },
  updatedBy: { publicId: 'user', name: 'Author', avatarUrl: null },
  cited: 0,
};
const pagination = { pageNumber: 1, pageSize: 20 };
const versionKey = 'document-list:space:version';
const pageKey = 'document-list:space:user:0:1:20';

describe('DocumentService list cache', () => {
  const values = new Map<string, string>();
  const cache = {
    get: jest.fn((key: string) => Promise.resolve(values.get(key))),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    delete: jest.fn(),
  };
  const membership = { getMembershipInKnowledgeSpace: jest.fn() };
  const query = {
    validateCachedDocumentList: jest.fn().mockResolvedValue(ok(true)),
    getDocumentTrash: jest.fn(),
    searchDocumentsInKnowledgeSpace: jest.fn(),
    getDocumentListInKnowledgeSpace: jest.fn(),
    getDocumentListItemByPublicId: jest.fn(),
  };
  const repository = {
    softDeleteDocument: jest.fn().mockResolvedValue(ok(undefined)),
    restoreDocument: jest.fn().mockResolvedValue(ok(item)),
    transitionDocumentStatus: jest.fn(),
    addDocument: jest.fn(),
    updateDocument: jest.fn(),
    getDocumentStorageDataByPublicId: jest.fn(),
  };
  const queue = { add: jest.fn() };
  const notifier = {
    notifyDocumentStatus: jest.fn().mockResolvedValue(undefined),
  };
  const permissions = { checkDocumentPermission: jest.fn() };
  let warning: jest.SpyInstance;
  let service: DocumentService;
  let page: PageResult<DocumentListResponseDto>;

  beforeEach(async () => {
    jest.clearAllMocks();
    values.clear();
    cache.get
      .mockReset()
      .mockImplementation((key: string) => Promise.resolve(values.get(key)));
    cache.set.mockReset().mockImplementation((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    });
    warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    page = new PageResult([item], 1, 1, 1, 20);
    membership.getMembershipInKnowledgeSpace
      .mockReset()
      .mockResolvedValue(
        ok({ knowledgeSpaceId: 7, userId: 8, role: KnowledgeSpaceRole.Editor }),
      );
    query.getDocumentListInKnowledgeSpace.mockResolvedValue(ok(page));
    query.searchDocumentsInKnowledgeSpace
      .mockReset()
      .mockResolvedValue(ok(page));
    query.getDocumentListItemByPublicId.mockReset().mockResolvedValue(ok(item));
    repository.addDocument.mockReset().mockResolvedValue(ok(undefined));
    repository.updateDocument.mockResolvedValue(
      ok({ updatedAt: item.lastUpdated, status: CommonDocumentStatus.Ready }),
    );
    repository.getDocumentStorageDataByPublicId.mockResolvedValue(
      ok({
        id: 9,
        storagePath: 'old',
        fileName: item.title,
        visibility: CommonDocumentVisibility.Public,
      }),
    );
    queue.add.mockReset().mockResolvedValue(undefined);
    notifier.notifyDocumentStatus.mockReset().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: IRealtimeNotifier, useValue: notifier },
        { provide: IApplicationCache, useValue: cache },
        { provide: IDocumentRepository, useValue: repository },
        { provide: IDocumentQueryRepository, useValue: query },
        { provide: IKnowledgeSpaceRepository, useValue: membership },
        {
          provide: ICategoryRepository,
          useValue: {
            getCategoryIdByPublicId: jest
              .fn()
              .mockResolvedValue(ok({ id: 3, name: 'Guides' })),
          },
        },
        {
          provide: IUserRepository,
          useValue: {
            GetUserDataByPublicId: jest
              .fn()
              .mockResolvedValue(ok({ name: 'Author', avatarUrl: null })),
          },
        },
        {
          provide: IFileStorage,
          useValue: {
            GetObjectMetadata: jest
              .fn()
              .mockResolvedValue(ok({ contentLength: 10 })),
          },
        },
        { provide: IDocumentPermissionRepository, useValue: permissions },
        { provide: getQueueToken(QueueName.IngestionQueue), useValue: queue },
      ],
    }).compile();
    service = module.get(DocumentService);
  });
  afterEach(() => jest.restoreAllMocks());
  const read = () => service.getDocumentListAsync('space', 'user', pagination);

  describe('trash management', () => {
    it.each([KnowledgeSpaceRole.Editor, KnowledgeSpaceRole.Owner])(
      'allows %s to delete/restore Restricted documents without permissions or queue writes',
      async (role) => {
        membership.getMembershipInKnowledgeSpace.mockResolvedValue(
          ok({ knowledgeSpaceId: 7, userId: 8, role }),
        );
        expect(
          (await service.deleteDocumentAsync('space', 'user', 'doc')).isOk(),
        ).toBe(true);
        expect(
          (
            await service.restoreDocumentAsync('space', 'user', 'doc')
          )._unsafeUnwrap(),
        ).toEqual(item);
        expect(repository.softDeleteDocument).toHaveBeenCalledWith('doc', 7);
        expect(repository.restoreDocument).toHaveBeenCalledWith('doc', 7);
        expect(permissions.checkDocumentPermission).not.toHaveBeenCalled();
        expect(queue.add).not.toHaveBeenCalled();
      },
    );
    it.each([null, KnowledgeSpaceRole.Viewer])(
      'rejects %s before querying trash or documents',
      async (role) => {
        membership.getMembershipInKnowledgeSpace.mockResolvedValue(
          ok(role === null ? null : { knowledgeSpaceId: 7, userId: 8, role }),
        );
        expect(
          (
            await service.deleteDocumentAsync('space', 'user', 'doc')
          )._unsafeUnwrapErr().code,
        ).toBe(ErrorCode.Forbidden);
        expect(
          (
            await service.restoreDocumentAsync('space', 'user', 'doc')
          )._unsafeUnwrapErr().code,
        ).toBe(ErrorCode.Forbidden);
        expect(
          (
            await service.getDocumentTrashAsync('space', 'user', pagination)
          )._unsafeUnwrapErr().code,
        ).toBe(ErrorCode.Forbidden);
        expect(repository.softDeleteDocument).not.toHaveBeenCalled();
        expect(repository.restoreDocument).not.toHaveBeenCalled();
        expect(query.getDocumentTrash).not.toHaveBeenCalled();
      },
    );
    it('discards an invalid cached page even if Redis invalidation failed', async () => {
      values.set(pageKey, JSON.stringify(page));
      query.validateCachedDocumentList.mockResolvedValueOnce(ok(false));
      query.getDocumentListInKnowledgeSpace.mockResolvedValueOnce(
        ok(new PageResult([], 0, 1, 1, 20)),
      );
      expect((await read())._unsafeUnwrap().items).toEqual([]);
    });
  });

  describe('retryIngestDocumentAsync', () => {
    let errorLog: jest.SpyInstance;
    const retryTime = new Date('2026-10-04T12:00:00Z');
    const failedItem = { ...item, status: CommonDocumentStatus.Failed };
    const retry = () =>
      service.retryIngestDocumentAsync('space', 'user', 'doc');

    beforeEach(() => {
      errorLog = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      query.getDocumentListItemByPublicId.mockResolvedValue(ok(failedItem));
      repository.transitionDocumentStatus
        .mockReset()
        .mockResolvedValue(ok(retryTime));
      queue.add.mockReset().mockResolvedValue(undefined);
    });

    it.each([null, KnowledgeSpaceRole.Viewer])(
      'rejects %s before reading the document',
      async (role) => {
        membership.getMembershipInKnowledgeSpace.mockResolvedValueOnce(
          ok(role === null ? null : { knowledgeSpaceId: 7, userId: 8, role }),
        );
        expect((await retry())._unsafeUnwrapErr().code).toBe(
          ErrorCode.Forbidden,
        );
        expect(query.getDocumentListItemByPublicId).not.toHaveBeenCalled();
        expect(repository.transitionDocumentStatus).not.toHaveBeenCalled();
        expect(queue.add).not.toHaveBeenCalled();
      },
    );

    it.each([KnowledgeSpaceRole.Editor, KnowledgeSpaceRole.Owner])(
      'allows %s to retry restricted documents without a document permission',
      async (role) => {
        membership.getMembershipInKnowledgeSpace.mockResolvedValueOnce(
          ok({ knowledgeSpaceId: 7, userId: 8, role }),
        );
        query.getDocumentListItemByPublicId.mockResolvedValueOnce(
          ok({
            ...failedItem,
            visibility: CommonDocumentVisibility.Restricted,
          }),
        );
        expect((await retry())._unsafeUnwrap()).toMatchObject({
          status: CommonDocumentStatus.Processing,
          visibility: CommonDocumentVisibility.Restricted,
        });
        expect(permissions.checkDocumentPermission).not.toHaveBeenCalled();
      },
    );

    it('returns 404 for a document outside the space', async () => {
      query.getDocumentListItemByPublicId.mockResolvedValueOnce(ok(null));
      expect((await retry())._unsafeUnwrapErr().code).toBe(ErrorCode.NotFound);
      expect(query.getDocumentListItemByPublicId).toHaveBeenCalledWith(
        7,
        'doc',
      );
      expect(repository.transitionDocumentStatus).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it.each([CommonDocumentStatus.Ready, CommonDocumentStatus.Processing])(
      'rejects status %s without enqueueing',
      async (status) => {
        query.getDocumentListItemByPublicId.mockResolvedValueOnce(
          ok({ ...item, status }),
        );
        expect((await retry())._unsafeUnwrapErr().code).toBe(
          ErrorCode.Conflict,
        );
        expect(repository.transitionDocumentStatus).not.toHaveBeenCalled();
        expect(queue.add).not.toHaveBeenCalled();
      },
    );

    it.each(['membership', 'snapshot', 'transition'])(
      'maps %s repository errors to 500',
      async (operation) => {
        const failure = err(new Error('DB unavailable'));
        if (operation === 'membership')
          membership.getMembershipInKnowledgeSpace.mockResolvedValueOnce(
            failure,
          );
        if (operation === 'snapshot')
          query.getDocumentListItemByPublicId.mockResolvedValueOnce(failure);
        if (operation === 'transition')
          repository.transitionDocumentStatus.mockResolvedValueOnce(failure);
        expect((await retry())._unsafeUnwrapErr().code).toBe(
          ErrorCode.InternalServerError,
        );
        expect(queue.add).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
      },
    );

    it('conditionally claims the failed snapshot, invalidates both caches and returns Processing even if the worker finishes', async () => {
      queue.add.mockImplementationOnce(() => {
        expect(values.get(versionKey)).toEqual(expect.any(String));
        expect(values.get('rag:similar-chunks:version:7')).toEqual(
          expect.any(String),
        );
        query.getDocumentListItemByPublicId.mockResolvedValue(
          ok({ ...item, status: CommonDocumentStatus.Ready }),
        );
        return Promise.resolve();
      });
      expect((await retry())._unsafeUnwrap()).toEqual({
        ...failedItem,
        status: CommonDocumentStatus.Processing,
        lastUpdated: retryTime,
      });
      expect(membership.getMembershipInKnowledgeSpace).toHaveBeenCalledWith(
        'user',
        'space',
      );
      expect(repository.transitionDocumentStatus).toHaveBeenCalledWith(
        'doc',
        7,
        CommonDocumentStatus.Failed,
        item.lastUpdated,
        CommonDocumentStatus.Processing,
      );
      expect(query.getDocumentListItemByPublicId).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith(
        EventName.IngestionDocument,
        { documentPublicId: 'doc', expectedUpdatedAt: retryTime.toISOString() },
        { attempts: 3 },
      );
      expect(failedItem.status).toBe(CommonDocumentStatus.Failed);
    });

    it('does not enqueue or invalidate when another request wins the transition', async () => {
      repository.transitionDocumentStatus.mockResolvedValueOnce(ok(null));
      expect((await retry())._unsafeUnwrapErr().code).toBe(ErrorCode.Conflict);
      expect(queue.add).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('enqueues only one of two concurrent retries of the same snapshot', async () => {
      repository.transitionDocumentStatus
        .mockResolvedValueOnce(ok(retryTime))
        .mockResolvedValueOnce(ok(null));
      const results = await Promise.all([retry(), retry()]);
      expect(results.filter((result) => result.isOk())).toHaveLength(1);
      expect(
        results.filter((result) => result.isErr())[0]._unsafeUnwrapErr().code,
      ).toBe(ErrorCode.Conflict);
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it.each(['restored', 'changed', 'error', 'rejected'])(
      'conditionally rolls back on queue failure (%s) and invalidates again',
      async (rollback) => {
        queue.add.mockRejectedValueOnce(new Error('Queue unavailable'));
        if (rollback === 'changed')
          repository.transitionDocumentStatus
            .mockResolvedValueOnce(ok(retryTime))
            .mockResolvedValueOnce(ok(null));
        if (rollback === 'error')
          repository.transitionDocumentStatus
            .mockResolvedValueOnce(ok(retryTime))
            .mockResolvedValueOnce(err(new Error('DB unavailable')));
        if (rollback === 'rejected')
          repository.transitionDocumentStatus
            .mockResolvedValueOnce(ok(retryTime))
            .mockRejectedValueOnce(new Error('DB unavailable'));
        expect((await retry())._unsafeUnwrapErr().code).toBe(
          ErrorCode.InternalServerError,
        );
        expect(repository.transitionDocumentStatus).toHaveBeenNthCalledWith(
          2,
          'doc',
          7,
          CommonDocumentStatus.Processing,
          retryTime,
          CommonDocumentStatus.Failed,
        );
        expect(repository.transitionDocumentStatus).toHaveBeenCalledTimes(2);
        expect(cache.set.mock.calls.map((call) => call[0])).toEqual([
          versionKey,
          'rag:similar-chunks:version:7',
          versionKey,
          'rag:similar-chunks:version:7',
        ]);
        if (rollback === 'restored')
          expect(notifier.notifyDocumentStatus).toHaveBeenCalledWith(7, {
            documentPublicId: 'doc',
            knowledgeSpacePublicId: 'space',
            fileName: failedItem.title,
            status: 'Failed',
            updatedAt: retryTime.toISOString(),
          });
        else expect(notifier.notifyDocumentStatus).not.toHaveBeenCalled();
        if (rollback === 'error' || rollback === 'rejected')
          expect(errorLog).toHaveBeenCalledWith(
            expect.stringContaining('restore'),
            expect.any(Error),
          );
      },
    );

    it('continues to enqueue when cache invalidation fails', async () => {
      cache.set.mockRejectedValue(new Error('Cache unavailable'));
      expect((await retry())._unsafeUnwrap().status).toBe(
        CommonDocumentStatus.Processing,
      );
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(warning).toHaveBeenCalledTimes(2);
    });

    it('maps unexpected repository rejections to 500', async () => {
      query.getDocumentListItemByPublicId.mockRejectedValueOnce(
        new Error('DB unavailable'),
      );
      expect((await retry())._unsafeUnwrapErr().code).toBe(
        ErrorCode.InternalServerError,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('searchDocumentsAsync', () => {
    const search = () =>
      service.searchDocumentsAsync('space', 'user', {
        documentName: 'Guide',
        ...pagination,
      });

    it('rejects non-members before querying documents', async () => {
      membership.getMembershipInKnowledgeSpace.mockResolvedValueOnce(ok(null));
      expect((await search())._unsafeUnwrapErr().code).toBe(
        ErrorCode.Forbidden,
      );
      expect(query.searchDocumentsInKnowledgeSpace).not.toHaveBeenCalled();
    });

    it.each([
      KnowledgeSpaceRole.Viewer,
      KnowledgeSpaceRole.Editor,
      KnowledgeSpaceRole.Owner,
    ])(
      'searches using internal IDs for %s members without cache',
      async (role) => {
        membership.getMembershipInKnowledgeSpace.mockResolvedValue(
          ok({ knowledgeSpaceId: 7, userId: 8, role }),
        );
        expect((await search())._unsafeUnwrap()).toEqual(page);
        expect(membership.getMembershipInKnowledgeSpace).toHaveBeenCalledWith(
          'user',
          'space',
        );
        expect(query.searchDocumentsInKnowledgeSpace).toHaveBeenCalledWith(
          7,
          8,
          'Guide',
          pagination,
        );
        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
        expect(query.getDocumentListInKnowledgeSpace).not.toHaveBeenCalled();
      },
    );

    it('maps membership repository errors to internal server errors', async () => {
      membership.getMembershipInKnowledgeSpace.mockResolvedValueOnce(
        err(new Error('DB unavailable')),
      );
      expect((await search())._unsafeUnwrapErr().code).toBe(
        ErrorCode.InternalServerError,
      );
      expect(query.searchDocumentsInKnowledgeSpace).not.toHaveBeenCalled();
    });

    it('maps search repository errors to internal server errors', async () => {
      query.searchDocumentsInKnowledgeSpace.mockResolvedValueOnce(
        err(new Error('DB unavailable')),
      );
      expect((await search())._unsafeUnwrapErr().code).toBe(
        ErrorCode.InternalServerError,
      );
    });

    it('maps unexpected repository rejections to internal server errors', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      query.searchDocumentsInKnowledgeSpace.mockRejectedValueOnce(
        new Error('DB unavailable'),
      );
      expect((await search())._unsafeUnwrapErr().code).toBe(
        ErrorCode.InternalServerError,
      );
    });

    it('returns an empty page successfully', async () => {
      const emptyPage = new PageResult<DocumentListResponseDto>(
        [],
        0,
        1,
        1,
        20,
      );
      query.searchDocumentsInKnowledgeSpace.mockResolvedValueOnce(
        ok(emptyPage),
      );
      expect((await search())._unsafeUnwrap()).toEqual(emptyPage);
    });
  });

  it('caches a miss as JSON and restores dates on a hit', async () => {
    expect((await read())._unsafeUnwrap()).toEqual(page);
    expect(cache.set).toHaveBeenCalledWith(pageKey, JSON.stringify(page));
    const hit = (await read())._unsafeUnwrap();
    expect(hit).toEqual(page);
    expect(hit.items[0].lastUpdated).toBeInstanceOf(Date);
    expect(query.getDocumentListInKnowledgeSpace).toHaveBeenCalledTimes(1);
    expect(membership.getMembershipInKnowledgeSpace).toHaveBeenCalledTimes(2);
  });
  it('caches empty pages', async () => {
    query.getDocumentListInKnowledgeSpace.mockResolvedValue(
      ok(new PageResult([], 0, 1, 1, 20)),
    );
    await read();
    await read();
    expect(query.getDocumentListInKnowledgeSpace).toHaveBeenCalledTimes(1);
  });
  it("does not reuse another user's cached restricted documents", async () => {
    const restrictedPage = new PageResult(
      [{ ...item, visibility: CommonDocumentVisibility.Restricted }],
      1,
      1,
      1,
      20,
    );
    query.getDocumentListInKnowledgeSpace.mockResolvedValueOnce(
      ok(restrictedPage),
    );
    expect((await read())._unsafeUnwrap().items).toHaveLength(1);
    membership.getMembershipInKnowledgeSpace.mockResolvedValueOnce(
      ok({ knowledgeSpaceId: 7, userId: 9, role: KnowledgeSpaceRole.Viewer }),
    );
    query.getDocumentListInKnowledgeSpace.mockResolvedValueOnce(
      ok(new PageResult([], 0, 1, 1, 20)),
    );
    const otherPage = (
      await service.getDocumentListAsync('space', 'other-user', pagination)
    )._unsafeUnwrap();
    expect(otherPage.items).toEqual([]);
    expect(otherPage.totalPages).toBe(0);
    expect(query.getDocumentListInKnowledgeSpace).toHaveBeenLastCalledWith(
      7,
      9,
      pagination,
    );
    expect(values.has('document-list:space:user:0:1:20')).toBe(true);
    expect(values.has('document-list:space:other-user:0:1:20')).toBe(true);
    await read();
    expect(query.getDocumentListInKnowledgeSpace).toHaveBeenCalledTimes(2);
  });
  it('ignores old cache entries shared by all users', async () => {
    values.set('document-list:space:0:1:20', JSON.stringify(page));
    query.getDocumentListInKnowledgeSpace.mockResolvedValueOnce(
      ok(new PageResult([], 0, 1, 1, 20)),
    );
    expect((await read())._unsafeUnwrap().items).toEqual([]);
    expect(query.getDocumentListInKnowledgeSpace).toHaveBeenCalledTimes(1);
  });
  it("refreshes every user's cached list when the space version changes", async () => {
    await read();
    await service.getDocumentListAsync('space', 'other-user', pagination);
    values.set(versionKey, 'permission-change');
    await read();
    await service.getDocumentListAsync('space', 'other-user', pagination);
    expect(query.getDocumentListInKnowledgeSpace).toHaveBeenCalledTimes(4);
    expect(values.has('document-list:space:user:permission-change:1:20')).toBe(
      true,
    );
    expect(
      values.has('document-list:space:other-user:permission-change:1:20'),
    ).toBe(true);
  });
  it('separates workspace, page number, page size and version', async () => {
    await read();
    await service.getDocumentListAsync('other', 'user', pagination);
    await service.getDocumentListAsync('space', 'user', {
      pageNumber: 2,
      pageSize: 20,
    });
    await service.getDocumentListAsync('space', 'user', {
      pageNumber: 1,
      pageSize: 10,
    });
    values.set(versionKey, 'new');
    await read();
    await read();
    expect(query.getDocumentListInKnowledgeSpace).toHaveBeenCalledTimes(5);
    expect(values.has('document-list:other:user:0:1:20')).toBe(true);
    expect(values.has('document-list:space:user:new:1:20')).toBe(true);
  });
  it('denies membership before any cache access even with a cached page', async () => {
    values.set(pageKey, JSON.stringify(page));
    membership.getMembershipInKnowledgeSpace.mockResolvedValue(ok(null));
    expect((await read()).isErr()).toBe(true);
    expect(cache.get).not.toHaveBeenCalled();
    expect(query.getDocumentListInKnowledgeSpace).not.toHaveBeenCalled();
  });
  it.each([
    '{broken',
    'null',
    '{}',
    JSON.stringify({ items: [{ lastUpdated: 'invalid' }] }),
  ])('falls back and logs malformed cache: %s', async (value) => {
    values.set(pageKey, value);
    expect((await read())._unsafeUnwrap()).toEqual(page);
    expect(query.getDocumentListInKnowledgeSpace).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalled();
  });
  it.each([1, 2])('returns DB data when cache read %s fails', async (call) => {
    if (call === 2) cache.get.mockResolvedValueOnce(undefined);
    cache.get.mockRejectedValueOnce(new Error('Redis unavailable'));
    expect((await read())._unsafeUnwrap()).toEqual(page);
    expect(warning).toHaveBeenCalled();
  });
  it('returns DB data when writing cache fails', async () => {
    cache.set.mockRejectedValueOnce(new Error('Redis unavailable'));
    expect((await read())._unsafeUnwrap()).toEqual(page);
    expect(warning).toHaveBeenCalled();
  });
  it('does not cache repository errors', async () => {
    query.getDocumentListInKnowledgeSpace.mockResolvedValue(
      err(new Error('DB unavailable')),
    );
    expect((await read()).isErr()).toBe(true);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('re-enqueues a Processing metadata edit with the written version', async () => {
    repository.updateDocument.mockResolvedValueOnce(
      ok({
        updatedAt: item.lastUpdated,
        status: CommonDocumentStatus.Processing,
      }),
    );
    repository.getDocumentStorageDataByPublicId.mockResolvedValueOnce(
      ok({
        id: 9,
        storagePath: 'old',
        fileName: item.title,
        visibility: CommonDocumentVisibility.Public,
        status: CommonDocumentStatus.Processing,
      }),
    );
    expect(
      (
        await service.updateDocumentAsync('space', 'user', 'doc', {
          name: 'Guide.txt',
        })
      ).isOk(),
    ).toBe(true);
    expect(queue.add).toHaveBeenCalledWith(
      EventName.IngestionDocument,
      {
        documentPublicId: 'doc',
        expectedUpdatedAt: item.lastUpdated.toISOString(),
      },
      { attempts: 3 },
    );
  });

  it.each([CommonDocumentStatus.Ready, CommonDocumentStatus.Failed])(
    'enqueues the locked Processing version after a concurrent ingestion starts from %s',
    async (status) => {
      repository.getDocumentStorageDataByPublicId.mockResolvedValueOnce(
        ok({
          id: 9,
          storagePath: 'old',
          visibility: CommonDocumentVisibility.Public,
          status,
        }),
      );
      repository.updateDocument.mockResolvedValueOnce(
        ok({
          updatedAt: item.lastUpdated,
          status: CommonDocumentStatus.Processing,
        }),
      );
      expect(
        (
          await service.updateDocumentAsync('space', 'user', 'doc', {
            name: 'Guide.txt',
          })
        ).isOk(),
      ).toBe(true);
      expect(queue.add).toHaveBeenCalledWith(
        EventName.IngestionDocument,
        {
          documentPublicId: 'doc',
          expectedUpdatedAt: item.lastUpdated.toISOString(),
        },
        { attempts: 3 },
      );
    },
  );

  describe('enqueue failure on create/update', () => {
    const failedAt = new Date('2026-10-08T12:00:00Z');
    let errorLog: jest.SpyInstance;
    let persisted: DocumentListResponseDto;
    const run = (operation: string) =>
      operation === 'create'
        ? service.createDocumentAsync('space', 'user', {
            name: 'Guide.txt',
            categoryPublicId: 'cat',
            storageKey: 'documents/space/file.txt',
          })
        : service.updateDocumentAsync('space', 'user', 'doc', {
            content: 'new content',
          });

    beforeEach(() => {
      errorLog = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      notifier.notifyDocumentStatus.mockReset().mockResolvedValue(undefined);
      queue.add.mockReset().mockRejectedValue(new Error('queue down'));
      persisted = { ...item };
      repository.addDocument.mockImplementation((document: Document) => {
        persisted = {
          ...item,
          publicId: document.publicId,
          lastUpdated: document.updatedAt,
        };
        return Promise.resolve(ok(undefined));
      });
      repository.updateDocument.mockResolvedValue(
        ok({
          updatedAt: item.lastUpdated,
          status: CommonDocumentStatus.Processing,
        }),
      );
      query.getDocumentListItemByPublicId.mockImplementation(() =>
        Promise.resolve(ok(persisted)),
      );
      repository.transitionDocumentStatus
        .mockReset()
        .mockImplementation(
          (
            id: string,
            space: number,
            status: CommonDocumentStatus,
            version: Date,
            next: CommonDocumentStatus,
          ) => {
            expect([id, space, status, version, next]).toEqual([
              persisted.publicId,
              7,
              CommonDocumentStatus.Processing,
              persisted.lastUpdated,
              CommonDocumentStatus.Failed,
            ]);
            persisted = {
              ...persisted,
              status: CommonDocumentStatus.Failed,
              lastUpdated: failedAt,
            };
            return Promise.resolve(ok(failedAt));
          },
        );
    });

    it.each(['create', 'update'])(
      '%s returns the persisted Failed version and emits after persistence/cache invalidation',
      async (operation) => {
        notifier.notifyDocumentStatus.mockImplementation(
          (space: number, event: unknown) => {
            expect(persisted.status).toBe(CommonDocumentStatus.Failed);
            expect(cache.set).toHaveBeenCalledTimes(4);
            expect([space, event]).toEqual([
              7,
              {
                documentPublicId: persisted.publicId,
                knowledgeSpacePublicId: 'space',
                fileName: persisted.title,
                status: 'Failed',
                updatedAt: failedAt.toISOString(),
              },
            ]);
            return Promise.resolve();
          },
        );
        const result = (await run(operation))._unsafeUnwrap();
        expect(result).toMatchObject({
          publicId: persisted.publicId,
          status: CommonDocumentStatus.Failed,
          lastUpdated: failedAt,
        });
        expect(notifier.notifyDocumentStatus).toHaveBeenCalledTimes(1);
      },
    );

    it.each(
      ['create', 'update'].flatMap((operation) =>
        [CommonDocumentStatus.Ready, CommonDocumentStatus.Processing].map(
          (status) => ({ operation, status }),
        ),
      ),
    )(
      '$operation reads current snapshot when a newer edit/worker won ($status)',
      async ({ operation, status }) => {
        repository.transitionDocumentStatus.mockImplementationOnce(() => {
          persisted = {
            ...persisted,
            title: 'newer.txt',
            status,
            lastUpdated: failedAt,
          };
          return Promise.resolve(ok(null));
        });
        expect((await run(operation))._unsafeUnwrap()).toEqual(persisted);
        expect(notifier.notifyDocumentStatus).not.toHaveBeenCalled();
      },
    );

    it.each(['create', 'update'])(
      '%s returns 404 when concurrently deleted',
      async (operation) => {
        repository.transitionDocumentStatus.mockResolvedValueOnce(ok(null));
        query.getDocumentListItemByPublicId.mockResolvedValue(ok(null));
        expect((await run(operation))._unsafeUnwrapErr().code).toBe(
          ErrorCode.NotFound,
        );
        expect(notifier.notifyDocumentStatus).not.toHaveBeenCalled();
      },
    );

    it.each(
      ['create', 'update'].flatMap((operation) =>
        ['error', 'rejected'].map((failure) => ({ operation, failure })),
      ),
    )(
      '$operation returns 500 and logs when Failed cannot be persisted ($failure)',
      async ({ operation, failure }) => {
        if (failure === 'error')
          repository.transitionDocumentStatus.mockResolvedValueOnce(
            err(new Error('db down')),
          );
        else
          repository.transitionDocumentStatus.mockRejectedValueOnce(
            new Error('db down'),
          );
        expect((await run(operation))._unsafeUnwrapErr().code).toBe(
          ErrorCode.InternalServerError,
        );
        expect(errorLog).toHaveBeenCalled();
        expect(notifier.notifyDocumentStatus).not.toHaveBeenCalled();
      },
    );

    it.each(['create', 'update'])(
      '%s keeps persisted success when notification rejects',
      async (operation) => {
        notifier.notifyDocumentStatus.mockRejectedValueOnce(
          new Error('notification down'),
        );
        expect((await run(operation))._unsafeUnwrap().status).toBe(
          CommonDocumentStatus.Failed,
        );
      },
    );
  });

  const mutate = (operation: string) =>
    operation === 'create'
      ? service.createDocumentAsync('space', 'user', {
          name: 'Guide.txt',
          categoryPublicId: 'cat',
          storageKey: 'documents/space/file.txt',
        })
      : service.updateDocumentAsync('space', 'user', 'doc', {
          name: 'Guide.txt',
        });
  it.each(['create', 'update'])(
    '%s invalidates only after persistence and forces the next read to miss',
    async (operation) => {
      await read();
      const save =
        operation === 'create'
          ? repository.addDocument
          : repository.updateDocument;
      save.mockImplementationOnce(() => {
        expect(values.has(versionKey)).toBe(false);
        return Promise.resolve(
          operation === 'create'
            ? ok(undefined)
            : ok({
                updatedAt: item.lastUpdated,
                status: CommonDocumentStatus.Ready,
              }),
        );
      });
      expect((await mutate(operation)).isOk()).toBe(true);
      expect(cache.set).toHaveBeenCalledWith(
        versionKey,
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        0,
      );
      expect(cache.set).toHaveBeenCalledWith(
        'rag:similar-chunks:version:7',
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        0,
      );
      const firstVersion = values.get(versionKey);
      await read();
      expect(query.getDocumentListInKnowledgeSpace).toHaveBeenCalledTimes(2);
      await mutate(operation);
      expect(values.get(versionKey)).not.toBe(firstVersion);
    },
  );
  it.each(['create', 'update'])(
    '%s does not invalidate when persistence fails',
    async (operation) => {
      (operation === 'create'
        ? repository.addDocument
        : repository.updateDocument
      ).mockResolvedValueOnce(err(new Error('DB unavailable')));
      expect((await mutate(operation)).isErr()).toBe(true);
      expect(cache.set).not.toHaveBeenCalled();
    },
  );
  it.each(['create', 'update'])(
    '%s still succeeds when invalidation fails',
    async (operation) => {
      cache.set.mockRejectedValueOnce(new Error('Redis unavailable'));
      expect((await mutate(operation)).isOk()).toBe(true);
      expect(warning).toHaveBeenCalled();
    },
  );
  it('keeps an in-flight old query out of the new version after update', async () => {
    let finish!: (
      value: Result<PageResult<DocumentListResponseDto>, Error>,
    ) => void;
    let started!: () => void;
    const querying = new Promise<void>((resolve) => {
      started = resolve;
    });
    query.getDocumentListInKnowledgeSpace.mockImplementationOnce(() => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = read();
    await querying;
    await mutate('update');
    finish(ok(page));
    await pending;
    expect(values.get(pageKey)).toBe(JSON.stringify(page));
    await read();
    expect(query.getDocumentListInKnowledgeSpace).toHaveBeenCalledTimes(2);
  });
});
