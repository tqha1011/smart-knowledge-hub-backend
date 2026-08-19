import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  imports: [
    BullModule.forRoot({
      defaultJobOptions: {
        attempts: 3,
      },
    }),
  ],
})
export class QueueModule {}
