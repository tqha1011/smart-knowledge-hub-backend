import { createKeyv } from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
  exports: [CacheModule],
})
export class CachingModule {}
