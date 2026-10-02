import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { RedisApplicationCache } from './redis-application-cache';

describe('RedisApplicationCache', () => {
  it('propagates a store read error that cache-manager would otherwise treat as a miss', async () => {
    const store = new Keyv({
      store: {
        get: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
        set: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
      },
      throwOnErrors: true,
    });
    const manager = createCache({ stores: [store] });
    const errors: unknown[] = [];
    manager.on('get', (event) => {
      if (event.error) errors.push(event.error);
    });
    expect(await manager.get('document-list:space:version')).toBeUndefined();
    expect(errors).toHaveLength(1);
    const cache = new RedisApplicationCache(manager);
    await expect(cache.get('document-list:space:version')).rejects.toThrow(
      'Redis unavailable',
    );
  });
});
