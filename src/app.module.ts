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
import { CategoryModule } from './modules/category/category.module';
import { ChatMessageModule } from './modules/chat/chat-message.module';
import { DocumentModule } from './modules/document/document.module';
import { KnowledgeSpaceModule } from './modules/knowledge-space/knowledgeSpace.module';
import { RagModule } from './modules/rag/rag.module';
import { UserModule } from './modules/user/user.module';
import { LoggerMiddleware } from './shared/common/logger.middleware';
import { CachingModule } from './shared/infrastructure/cache/caching.module';
import { PrismaModule } from './shared/infrastructure/database/prisma.module';
import { NotificationModule } from './shared/infrastructure/notification/notification.module';
import { QueueModule } from './shared/infrastructure/queue/queue.module';
import { StorageModule } from './shared/infrastructure/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    ConfigModule,
    CachingModule,
    UserModule,
    AuthModule,
    DocumentModule,
    ChatMessageModule,
    CategoryModule,
    QueueModule,
    KnowledgeSpaceModule,
    StorageModule,
    RagModule,
    NotificationModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'limitPerMinute-auth',
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
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
