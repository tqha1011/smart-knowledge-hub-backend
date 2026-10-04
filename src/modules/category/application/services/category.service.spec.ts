import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { ErrorCode } from 'src/shared/common/errorCode';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { ICategoryRepository } from '../../domain/repositories/category.repo.interface';
import { CategoryRepository } from '../../infrastructure/category.repo';
import { CategoryService } from './category.service';

describe('CategoryService cache', () => {
  const key = 'category-list:7:0';
  const categories = [{ publicId: 'category', name: 'Guides' }];
  const values = new Map<string, string>();
  const cache = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
  const membership = { getMembershipInKnowledgeSpace: jest.fn() };
  const database = {
    category: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  };
  let service: CategoryService;
  let repository: ICategoryRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    values.clear();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    cache.get.mockImplementation((cacheKey: string) =>
      Promise.resolve(values.get(cacheKey)),
    );
    cache.set.mockImplementation((cacheKey: string, value: string) => {
      values.set(cacheKey, value);
      return Promise.resolve();
    });
    cache.delete.mockImplementation((cacheKey: string) => {
      values.delete(cacheKey);
      return Promise.resolve();
    });
    membership.getMembershipInKnowledgeSpace.mockResolvedValue(
      ok({ knowledgeSpaceId: 7, userId: 8, role: KnowledgeSpaceRole.Owner }),
    );
    database.category.findMany.mockResolvedValue(categories);
    database.category.findFirst.mockResolvedValue(null);
    database.category.create.mockImplementation(
      (args: { data: { publicId: string; name: string } }) =>
        Promise.resolve({ id: 9, ...args.data }),
    );
    const module = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: ICategoryRepository, useClass: CategoryRepository },
        { provide: PrismaService, useValue: database },
        { provide: IKnowledgeSpaceRepository, useValue: membership },
        { provide: IApplicationCache, useValue: cache },
      ],
    }).compile();
    service = module.get(CategoryService);
    repository = module.get(ICategoryRepository);
  });
  afterEach(() => jest.restoreAllMocks());
  const read = (space = 'space', user = 'user') =>
    service.getCategoryList(user, space);

  it('shares the seven-day cache within a space and still checks membership on every read', async () => {
    expect((await read())._unsafeUnwrap()).toEqual(categories);
    expect((await read('space', 'other-user'))._unsafeUnwrap()).toEqual(
      categories,
    );
    expect(database.category.findMany).toHaveBeenCalledTimes(1);
    expect(database.category.findMany).toHaveBeenCalledWith({
      where: { knowledgeSpaceId: 7 },
      select: { publicId: true, name: true },
    });
    expect(cache.set).toHaveBeenCalledWith(
      key,
      JSON.stringify(categories),
      604800000,
    );
    expect(membership.getMembershipInKnowledgeSpace).toHaveBeenCalledTimes(2);
    expect(membership.getMembershipInKnowledgeSpace).toHaveBeenLastCalledWith(
      'other-user',
      'space',
    );
  });

  it.each([null, KnowledgeSpaceRole.Viewer])(
    'denies %s before reading a warm cache',
    async (role) => {
      values.set(key, JSON.stringify(categories));
      membership.getMembershipInKnowledgeSpace.mockResolvedValueOnce(
        ok(role === null ? null : { knowledgeSpaceId: 7, userId: 8, role }),
      );
      expect((await read())._unsafeUnwrapErr().code).toBe(ErrorCode.Forbidden);
      expect(cache.get).not.toHaveBeenCalled();
      expect(database.category.findMany).not.toHaveBeenCalled();
    },
  );

  it('separates lists by knowledge space', async () => {
    await read();
    membership.getMembershipInKnowledgeSpace.mockResolvedValueOnce(
      ok({ knowledgeSpaceId: 10, userId: 8, role: KnowledgeSpaceRole.Editor }),
    );
    database.category.findMany.mockResolvedValueOnce([
      { publicId: 'other', name: 'Other' },
    ]);
    expect((await read('other-space'))._unsafeUnwrap()).toEqual([
      { publicId: 'other', name: 'Other' },
    ]);
    expect(values.has('category-list:10:0')).toBe(true);
    expect(database.category.findMany).toHaveBeenCalledTimes(2);
  });

  it('caches empty lists', async () => {
    database.category.findMany.mockResolvedValue([]);
    expect((await read())._unsafeUnwrap()).toEqual([]);
    expect((await read())._unsafeUnwrap()).toEqual([]);
    expect(database.category.findMany).toHaveBeenCalledTimes(1);
  });

  it.each(['read', 'write', 'malformed', 'shape'])(
    'falls back to database on cache %s failure',
    async (failure) => {
      if (failure === 'read')
        cache.get.mockRejectedValueOnce(new Error('Redis down'));
      if (failure === 'write')
        cache.set.mockRejectedValueOnce(new Error('Redis down'));
      if (failure === 'malformed') values.set(key, '{bad');
      if (failure === 'shape') values.set(key, '{}');
      expect((await read())._unsafeUnwrap()).toEqual(categories);
      expect(database.category.findMany).toHaveBeenCalledTimes(1);
    },
  );

  it('does not cache database failures', async () => {
    database.category.findMany.mockRejectedValueOnce(new Error('DB down'));
    expect((await read())._unsafeUnwrapErr().code).toBe(
      ErrorCode.InternalServerError,
    );
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('deletes only this space cache after creating a category and refreshes on the next read', async () => {
    await read();
    values.set('category-list:10:0', '[]');
    database.category.create.mockImplementationOnce(
      (args: { data: { publicId: string; name: string } }) => {
        expect(values.has(key)).toBe(true);
        return Promise.resolve({ id: 9, ...args.data });
      },
    );
    const result = (
      await service.createCategory('user', 'space', { name: 'New' })
    )._unsafeUnwrap();
    expect(result.name).toBe('New');
    expect(result.publicId).toEqual(expect.any(String));
    expect(cache.delete).toHaveBeenCalledWith(key);
    expect(values.has(key)).toBe(false);
    expect(values.has('category-list:10:0')).toBe(true);
    database.category.findMany.mockResolvedValueOnce([...categories, result]);
    expect((await read())._unsafeUnwrap()).toEqual([...categories, result]);
  });

  it('invalidates categories created directly through the repository by the FAQ flow', async () => {
    values.set(key, JSON.stringify(categories));
    expect(
      (await repository.createCategory('faq', 'Resolved Questions', 7)).isOk(),
    ).toBe(true);
    expect(cache.delete).toHaveBeenCalledWith(key);
    expect(values.has(key)).toBe(false);
  });

  it('does not serve a stale list refilled by a read started before a category was created', async () => {
    let finishRead!: (value: typeof categories) => void;
    let readStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      readStarted = resolve;
    });
    database.category.findMany.mockImplementationOnce(() => {
      readStarted();
      return new Promise<typeof categories>((resolve) => {
        finishRead = resolve;
      });
    });
    const oldRead = read();
    await started;
    await repository.createCategory('faq', 'Resolved Questions', 7);
    finishRead(categories);
    await oldRead;
    const updated = [
      ...categories,
      { publicId: 'faq', name: 'Resolved Questions' },
    ];
    database.category.findMany.mockResolvedValueOnce(updated);
    expect((await read())._unsafeUnwrap()).toEqual(updated);
  });

  it.each(['denied', 'conflict', 'lookup', 'create'])(
    'keeps cache when creation fails at %s',
    async (failure) => {
      if (failure === 'denied')
        membership.getMembershipInKnowledgeSpace.mockResolvedValueOnce(
          ok({
            knowledgeSpaceId: 7,
            userId: 8,
            role: KnowledgeSpaceRole.Editor,
          }),
        );
      if (failure === 'conflict')
        database.category.findFirst.mockResolvedValueOnce({ id: 1 });
      if (failure === 'lookup')
        database.category.findFirst.mockRejectedValueOnce(new Error('DB down'));
      if (failure === 'create')
        database.category.create.mockRejectedValueOnce(new Error('DB down'));
      expect(
        (
          await service.createCategory('user', 'space', { name: 'New' })
        ).isErr(),
      ).toBe(true);
      expect(cache.delete).not.toHaveBeenCalled();
    },
  );

  it('preserves successful category creation when cache deletion fails', async () => {
    cache.delete.mockRejectedValueOnce(new Error('Redis down'));
    expect(
      (await service.createCategory('user', 'space', { name: 'New' })).isOk(),
    ).toBe(true);
    expect(cache.delete).toHaveBeenCalledWith(key);
  });

  it('still deletes the old list if writing the new cache version fails', async () => {
    values.set(key, JSON.stringify(categories));
    cache.set.mockRejectedValueOnce(new Error('Redis down'));
    expect(
      (await repository.createCategory('faq', 'Resolved Questions', 7)).isOk(),
    ).toBe(true);
    expect(cache.delete).toHaveBeenCalledWith(key);
    expect(values.has(key)).toBe(false);
  });

  it('changes the version even when reading the previous version during invalidation fails', async () => {
    values.set('category-list:7:version', 'current');
    values.set('category-list:7:current', JSON.stringify(categories));
    cache.get.mockRejectedValueOnce(new Error('Transient read failure'));
    expect(
      (await repository.createCategory('faq', 'Resolved Questions', 7)).isOk(),
    ).toBe(true);
    const updated = [
      ...categories,
      { publicId: 'faq', name: 'Resolved Questions' },
    ];
    database.category.findMany.mockResolvedValueOnce(updated);
    expect((await read())._unsafeUnwrap()).toEqual(updated);
  });

  it('maps membership errors without touching cache', async () => {
    membership.getMembershipInKnowledgeSpace.mockResolvedValueOnce(
      err(new Error('DB down')),
    );
    expect((await read())._unsafeUnwrapErr().code).toBe(
      ErrorCode.InternalServerError,
    );
    expect(cache.get).not.toHaveBeenCalled();
  });
});
