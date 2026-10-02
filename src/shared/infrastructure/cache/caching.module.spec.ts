import { DynamicModule, FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createKeyv } from '@keyv/redis';
import { CachingModule } from './caching.module';

jest.mock('@keyv/redis', () => ({ createKeyv: jest.fn(() => ({})) }));

describe('CachingModule TTL', () => {
  it.each([
    ['45000', 45000],
    ['180000', 180000],
    [undefined, 180000],
    ['', 180000],
    ['   ', 180000],
    ['invalid', 180000],
    ['0', 180000],
    ['-1', 180000],
    ['Infinity', 180000],
    ['NaN', 180000],
  ])('configures CACHE_TTL=%s as %s milliseconds', (value, expected) => {
    const imports = Reflect.getMetadata(
      'imports',
      CachingModule,
    ) as DynamicModule[];
    const provider = imports[0].providers?.find(
      (entry) => typeof entry === 'object' && 'useFactory' in entry,
    ) as FactoryProvider;
    const config = new ConfigService({
      REDIS_URL: 'redis://localhost:6379',
      CACHE_TTL: value,
    });
    const options = provider.useFactory(config) as { ttl: number };
    expect(options.ttl).toBe(expected);
    expect(createKeyv).toHaveBeenCalledWith('redis://localhost:6379', {
      throwOnErrors: true,
    });
  });
});
