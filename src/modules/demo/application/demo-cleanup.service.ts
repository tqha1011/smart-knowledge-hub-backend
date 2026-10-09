import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DemoRepository } from '../infrastructure/demo.repo';

@Processor('demo-cleanup-queue', { concurrency: 1 })
export class DemoCleanupService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(DemoCleanupService.name);
  constructor(
    private readonly repo: DemoRepository,
    @InjectQueue('demo-cleanup-queue') private readonly queue: Queue,
  ) {
    super();
  }
  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      'demo-cleanup-hourly-v1',
      { every: 3600000 },
      {
        name: 'cleanup',
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 60000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
    );
  }
  async process() {
    let count: number;
    do {
      count = await this.repo.cleanup();
    } while (count === 100);
    this.logger.log('Expired demo cleanup completed');
  }
}
