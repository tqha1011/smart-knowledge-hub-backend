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
import { IFileStorage } from 'src/shared/infrastructure/storage/file-storage.interface';
import { IDocumentRepository } from '../../domain/repositories/document.repo.interface';
import { IDocumentPermissionRepository } from '../../domain/repositories/document-permission.repo.interface';
import { IDocumentQueryRepository } from '../interfaces/document-query.repo.interface';
import { DocumentListResponseDto } from '../dtos/document.response.dto';
import { DocumentService } from './document.service';

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
    searchDocumentsInKnowledgeSpace: jest.fn(),
    getDocumentListInKnowledgeSpace: jest.fn(),
    getDocumentListItemByPublicId: jest.fn(),
  };
  const repository = {
    addDocument: jest.fn(),
    updateDocument: jest.fn(),
    getDocumentStorageDataByPublicId: jest.fn(),
  };
  const queue = { add: jest.fn() };
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
    membership.getMembershipInKnowledgeSpace.mockResolvedValue(
      ok({ knowledgeSpaceId: 7, userId: 8, role: KnowledgeSpaceRole.Editor }),
    );
    query.getDocumentListInKnowledgeSpace.mockResolvedValue(ok(page));
    query.searchDocumentsInKnowledgeSpace
      .mockReset()
      .mockResolvedValue(ok(page));
    query.getDocumentListItemByPublicId.mockResolvedValue(ok(item));
    repository.addDocument.mockResolvedValue(ok(undefined));
    repository.updateDocument.mockResolvedValue(ok(undefined));
    repository.getDocumentStorageDataByPublicId.mockResolvedValue(
      ok({
        id: 9,
        storagePath: 'old',
        visibility: CommonDocumentVisibility.Public,
      }),
    );
    const module = await Test.createTestingModule({
      providers: [
        DocumentService,
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
        { provide: IDocumentPermissionRepository, useValue: {} },
        { provide: getQueueToken(QueueName.IngestionQueue), useValue: queue },
      ],
    }).compile();
    service = module.get(DocumentService);
  });
  afterEach(() => jest.restoreAllMocks());
  const read = () => service.getDocumentListAsync('space', 'user', pagination);

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
        return Promise.resolve(ok(undefined));
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
