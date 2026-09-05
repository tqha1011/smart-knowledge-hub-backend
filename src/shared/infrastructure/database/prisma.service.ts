import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from 'generated/prisma/client';
import { Pool } from 'pg';
import { format } from 'sql-formatter';

type PrismaClientOptions = {
  adapter: PrismaPg;
  log: [
    { emit: 'event'; level: 'query' },
    { emit: 'stdout'; level: 'info' },
    { emit: 'stdout'; level: 'warn' },
    { emit: 'stdout'; level: 'error' },
  ];
};

@Injectable()
export class PrismaService
  extends PrismaClient<PrismaClientOptions>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    this.$on('query', (e: Prisma.QueryEvent) => {
      this.logger.debug(
        `\n${format(e.query, { language: 'postgresql' })}\nparams: ${e.params}\nduration: ${e.duration}ms\n`,
      );
    });
  }
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
