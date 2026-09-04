import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        ttl: Number(configService.get<string>('CACHE_TTL')),
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [CacheModule],
})
export class CachingModule {}
