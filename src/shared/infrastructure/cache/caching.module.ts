import { createKeyv } from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IApplicationCache } from './cache-manager.interface';
import { RedisApplicationCache } from './redis-application-cache';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        stores: createKeyv(configService.getOrThrow<string>('REDIS_URL')),
        ttl: Number(configService.get<string>('CACHE_TTL')),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    {
      provide: IApplicationCache,
      useClass: RedisApplicationCache,
    },
  ],
  exports: [CacheModule, IApplicationCache],
})
export class CachingModule {}
