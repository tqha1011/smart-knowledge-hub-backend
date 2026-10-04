import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import {
  CommonPermissionType,
  KnowledgeSpaceRole,
} from 'src/shared/domain/enum';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { IDocumentPermissionRepository } from '../../domain/repositories/document-permission.repo.interface';
import { IDocumentRepository } from '../../domain/repositories/document.repo.interface';
import { DocumentPermissionService } from './document-permission-service';

describe('DocumentPermissionService retrieval cache invalidation', () => {
  const permissions = [
    { userPublicId: 'target', permission: CommonPermissionType.Read },
  ];
  const membership = { getMembershipInKnowledgeSpace: jest.fn() };
  const documents = { getDocumentIdByPublicId: jest.fn() };
  const users = { GetUserIdsByPublicIds: jest.fn() };
  const repository = {
    addDocumentPermission: jest.fn(),
    updateDocumentPermission: jest.fn(),
  };
  const cache = {
    get: jest.fn(),
    set: jest.fn<Promise<void>, [string, string, number?]>(),
    delete: jest.fn(),
  };
  let service: DocumentPermissionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    membership.getMembershipInKnowledgeSpace.mockResolvedValue(
      ok({ knowledgeSpaceId: 7, userId: 8, role: KnowledgeSpaceRole.Editor }),
    );
    documents.getDocumentIdByPublicId.mockResolvedValue(ok(42));
    users.GetUserIdsByPublicIds.mockResolvedValue(
      ok([{ publicId: 'target', id: 9 }]),
    );
    repository.addDocumentPermission.mockResolvedValue(ok(undefined));
    repository.updateDocumentPermission.mockResolvedValue(ok(undefined));
    cache.set.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        DocumentPermissionService,
        { provide: IKnowledgeSpaceRepository, useValue: membership },
        { provide: IDocumentRepository, useValue: documents },
        { provide: IUserRepository, useValue: users },
        { provide: IDocumentPermissionRepository, useValue: repository },
        { provide: IApplicationCache, useValue: cache },
      ],
    }).compile();
    service = module.get(DocumentPermissionService);
  });

  const mutate = (action: 'add' | 'update') =>
    action === 'add'
      ? service.addDocumentPermissionAsync(
          'space',
          'owner',
          'document',
          permissions,
        )
      : service.updateDocumentPermissionAsync(
          'space',
          'owner',
          'document',
          permissions,
        );

  it.each(['add', 'update'] as const)(
    '%s changes both list and retrieval versions after permission persistence',
    async (action) => {
      repository[
        action === 'add' ? 'addDocumentPermission' : 'updateDocumentPermission'
      ].mockImplementationOnce(() => {
        expect(cache.set).not.toHaveBeenCalled();
        return Promise.resolve(ok(undefined));
      });

      expect((await mutate(action)).isOk()).toBe(true);
      expect(documents.getDocumentIdByPublicId).toHaveBeenCalledWith(
        'document',
        7,
      );
      expect(cache.set).toHaveBeenCalledWith(
        'document-list:space:version',
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        0,
      );
      expect(cache.set).toHaveBeenCalledWith(
        'rag:similar-chunks:version:7',
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        0,
      );
      const firstVersion: unknown = cache.set.mock.calls.find(
        (call) => call[0] === 'document-list:space:version',
      )?.[1];
      cache.set.mockClear();
      await mutate(action);
      const nextVersion: unknown = cache.set.mock.calls.find(
        (call) => call[0] === 'document-list:space:version',
      )?.[1];
      expect(nextVersion).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
      expect(nextVersion).not.toBe(firstVersion);
    },
  );

  it.each(['add', 'update'] as const)(
    '%s leaves the retrieval version alone if persistence fails',
    async (action) => {
      repository[
        action === 'add' ? 'addDocumentPermission' : 'updateDocumentPermission'
      ].mockResolvedValueOnce(err(new Error('DB unavailable')));

      expect((await mutate(action)).isErr()).toBe(true);
      expect(cache.set).not.toHaveBeenCalled();
    },
  );

  it.each(['document-list:space:version', 'rag:similar-chunks:version:7'])(
    'attempts both invalidations even if %s fails',
    async (failedKey) => {
      cache.set.mockImplementation((key: string) =>
        key === failedKey
          ? Promise.reject(new Error('Redis unavailable'))
          : Promise.resolve(),
      );
      expect((await mutate('update')).isOk()).toBe(true);
      expect(repository.updateDocumentPermission).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledWith(
        'document-list:space:version',
        expect.any(String),
        0,
      );
      expect(cache.set).toHaveBeenCalledWith(
        'rag:similar-chunks:version:7',
        expect.any(String),
        0,
      );
    },
  );

  it('invalidates the list when all document permissions are revoked', async () => {
    users.GetUserIdsByPublicIds.mockResolvedValueOnce(ok([]));
    const result = await service.updateDocumentPermissionAsync(
      'space',
      'owner',
      'document',
      [],
    );
    expect(result.isOk()).toBe(true);
    expect(repository.updateDocumentPermission).toHaveBeenCalledWith(42, []);
    expect(cache.set).toHaveBeenCalledWith(
      'document-list:space:version',
      expect.any(String),
      0,
    );
  });

  it.each(['add', 'update'] as const)(
    '%s rejects a document outside the authorized knowledge space',
    async (action) => {
      documents.getDocumentIdByPublicId.mockImplementation(
        (_publicId: string, knowledgeSpaceId: number) =>
          Promise.resolve(ok(knowledgeSpaceId === 7 ? null : 42)),
      );

      expect((await mutate(action)).isErr()).toBe(true);
      expect(repository.addDocumentPermission).not.toHaveBeenCalled();
      expect(repository.updateDocumentPermission).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    },
  );
});
