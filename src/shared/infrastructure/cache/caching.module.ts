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
      useFactory: (configService: ConfigService) => {
        const ttl = Number(configService.get<string>('CACHE_TTL'));
        return {
          stores: createKeyv(configService.getOrThrow<string>('REDIS_URL'), {
            throwOnErrors: true,
          }),
          ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : 180000,
        };
      },
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
