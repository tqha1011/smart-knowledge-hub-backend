import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { KnowledgeSpaceModule } from './modules/knowledge-space/knowledgeSpace.module';
import { UserModule } from './modules/user/user.module';
import { LoggerMiddleware } from './shared/common/logger.middleware';
import { PrismaModule } from './shared/infrastructure/database/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    ConfigModule,
    UserModule,
    AuthModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'limitPerMinute-auth',
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
    KnowledgeSpaceModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: 'api/*path', method: RequestMethod.ALL });
  }
}
