import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { DemoController } from './api/demo.controller';
import { DemoAccessGuard } from './api/demo-access.guard';
import { DemoService } from './application/demo.service';
import { DemoCleanupService } from './application/demo-cleanup.service';
import { DemoRepository } from './infrastructure/demo.repo';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: 'demo-cleanup-queue' })],
  controllers: [DemoController],
  providers: [
    DemoRepository,
    DemoService,
    DemoCleanupService,
    { provide: APP_GUARD, useClass: DemoAccessGuard },
  ],
  exports: [DemoRepository],
})
export class DemoModule {}
