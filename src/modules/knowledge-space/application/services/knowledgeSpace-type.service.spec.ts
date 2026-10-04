import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { err, ok, Result } from 'neverthrow';
import { ErrorCode } from 'src/shared/common/errorCode';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { IKnowledgeSpaceTypeRepository } from '../../domain/repositories/knowledgeSpace-type.repo.interface';
import { KnowledgeSpaceTypeService } from './knowledgeSpace-type.service';

describe('KnowledgeSpaceTypeService cache', () => {
  const key = 'knowledge-space-types:0';
  const types = [{ publicId: 'type', name: 'Engineering' }];
  const values = new Map<string, string>();
  const cache = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
  const repository = {
    getTypes: jest.fn(),
    getTypeIdByName: jest.fn(),
    addNewType: jest.fn(),
  };
  let service: KnowledgeSpaceTypeService;

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
    repository.getTypes.mockResolvedValue(ok(types));
    repository.getTypeIdByName.mockResolvedValue(ok(null));
    repository.addNewType.mockResolvedValue(
      ok({ publicId: 'new', name: 'Product' }),
    );
    const module = await Test.createTestingModule({
      providers: [
        KnowledgeSpaceTypeService,
        { provide: IKnowledgeSpaceTypeRepository, useValue: repository },
        { provide: IApplicationCache, useValue: cache },
      ],
    }).compile();
    service = module.get(KnowledgeSpaceTypeService);
  });
  afterEach(() => jest.restoreAllMocks());

  it('caches a successful list for seven days and serves subsequent reads without querying the repository', async () => {
    expect((await service.getTypes())._unsafeUnwrap()).toEqual(types);
    expect((await service.getTypes())._unsafeUnwrap()).toEqual(types);
    expect(repository.getTypes).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(
      key,
      JSON.stringify(types),
      604800000,
    );
  });

  it('caches empty lists', async () => {
    repository.getTypes.mockResolvedValue(ok([]));
    expect((await service.getTypes())._unsafeUnwrap()).toEqual([]);
    expect((await service.getTypes())._unsafeUnwrap()).toEqual([]);
    expect(repository.getTypes).toHaveBeenCalledTimes(1);
  });

  it.each(['read', 'write', 'malformed', 'shape'])(
    'falls back to database when cache has a %s failure',
    async (failure) => {
      if (failure === 'read')
        cache.get.mockRejectedValueOnce(new Error('Redis down'));
      if (failure === 'write')
        cache.set.mockRejectedValueOnce(new Error('Redis down'));
      if (failure === 'malformed') values.set(key, '{bad');
      if (failure === 'shape') values.set(key, '{}');
      expect((await service.getTypes())._unsafeUnwrap()).toEqual(types);
      expect(repository.getTypes).toHaveBeenCalledTimes(1);
    },
  );

  it('does not cache repository failures', async () => {
    repository.getTypes.mockResolvedValueOnce(err(new Error('DB down')));
    expect((await service.getTypes())._unsafeUnwrapErr().code).toBe(
      ErrorCode.InternalServerError,
    );
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('deletes the cached list after adding a type so the next read sees it', async () => {
    await service.getTypes();
    repository.addNewType.mockImplementationOnce(() => {
      expect(values.has(key)).toBe(true);
      return Promise.resolve(ok({ publicId: 'new', name: 'Product' }));
    });
    expect((await service.addNewType({ name: 'Product' })).isOk()).toBe(true);
    expect(cache.delete).toHaveBeenCalledWith(key);
    expect(values.has(key)).toBe(false);
    const updated = [...types, { publicId: 'new', name: 'Product' }];
    repository.getTypes.mockResolvedValueOnce(ok(updated));
    expect((await service.getTypes())._unsafeUnwrap()).toEqual(updated);
    expect(repository.getTypes).toHaveBeenCalledTimes(2);
  });

  it('does not serve a stale list refilled by a read started before a type was added', async () => {
    let finishRead!: (value: Result<typeof types, Error>) => void;
    let readStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      readStarted = resolve;
    });
    repository.getTypes.mockImplementationOnce(() => {
      readStarted();
      return new Promise<Result<typeof types, Error>>((resolve) => {
        finishRead = resolve;
      });
    });
    const oldRead = service.getTypes();
    await started;
    await service.addNewType({ name: 'Product' });
    finishRead(ok(types));
    await oldRead;
    const updated = [...types, { publicId: 'new', name: 'Product' }];
    repository.getTypes.mockResolvedValueOnce(ok(updated));
    expect((await service.getTypes())._unsafeUnwrap()).toEqual(updated);
  });

  it.each(['conflict', 'lookup', 'create'])(
    'keeps cache when adding a type fails at %s',
    async (failure) => {
      if (failure === 'conflict')
        repository.getTypeIdByName.mockResolvedValueOnce(ok(1));
      if (failure === 'lookup')
        repository.getTypeIdByName.mockResolvedValueOnce(
          err(new Error('DB down')),
        );
      if (failure === 'create')
        repository.addNewType.mockResolvedValueOnce(err(new Error('DB down')));
      expect((await service.addNewType({ name: 'Product' })).isErr()).toBe(
        true,
      );
      expect(cache.delete).not.toHaveBeenCalled();
    },
  );

  it('preserves a successful write when cache deletion fails', async () => {
    cache.delete.mockRejectedValueOnce(new Error('Redis down'));
    expect((await service.addNewType({ name: 'Product' })).isOk()).toBe(true);
    expect(cache.delete).toHaveBeenCalledWith(key);
  });

  it('still deletes the old list if writing the new cache version fails', async () => {
    values.set(key, JSON.stringify(types));
    cache.set.mockRejectedValueOnce(new Error('Redis down'));
    expect((await service.addNewType({ name: 'Product' })).isOk()).toBe(true);
    expect(cache.delete).toHaveBeenCalledWith(key);
    expect(values.has(key)).toBe(false);
  });

  it('changes the version even when reading the previous version during invalidation fails', async () => {
    values.set('knowledge-space-types:version', 'current');
    values.set('knowledge-space-types:current', JSON.stringify(types));
    cache.get.mockRejectedValueOnce(new Error('Transient read failure'));
    expect((await service.addNewType({ name: 'Product' })).isOk()).toBe(true);
    const updated = [...types, { publicId: 'new', name: 'Product' }];
    repository.getTypes.mockResolvedValueOnce(ok(updated));
    expect((await service.getTypes())._unsafeUnwrap()).toEqual(updated);
  });
});
