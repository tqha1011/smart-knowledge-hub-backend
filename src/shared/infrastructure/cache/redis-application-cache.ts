import { Inject } from '@nestjs/common';
import { IApplicationCache } from './cache-manager.interface';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

export class RedisApplicationCache implements IApplicationCache {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}
  get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set<T>(key, value, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }
}
