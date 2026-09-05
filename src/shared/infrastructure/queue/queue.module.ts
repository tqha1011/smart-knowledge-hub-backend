import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { QueueName } from './constant/queue-name';

const isProduction = process.env.NODE_ENV === 'production';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: new Redis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: null,
        }),
      }),
    }),

    BullModule.registerQueue(
      {
        name: QueueName.IngestionQueue,
      },
      {
        name: QueueName.GenerateTitleQueue,
      },
      {
        name: QueueName.SendEmailQueue,
      },
    ),

    ...(isProduction
      ? []
      : [
          BullBoardModule.forRoot({
            route: '/admin/queues',
            adapter: ExpressAdapter,
          }),
          BullBoardModule.forFeature({
            name: QueueName.IngestionQueue,
            adapter: BullMQAdapter,
          }),
          BullBoardModule.forFeature({
            name: QueueName.GenerateTitleQueue,
            adapter: BullMQAdapter,
          }),
          BullBoardModule.forFeature({
            name: QueueName.SendEmailQueue,
            adapter: BullMQAdapter,
          }),
        ]),
  ],
  exports: [BullModule],
})
export class QueueModule {}
