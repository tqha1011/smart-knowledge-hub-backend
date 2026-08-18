import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/shared/infrastructure/database/prisma.module';
import { ICategoryRepository } from './domain/repositories/category.repo.interface';
import { CategoryRepository } from './infrastructure/category.repo';

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: ICategoryRepository,
      useClass: CategoryRepository,
    },
  ],
  exports: [ICategoryRepository],
})
export class CategoryModule {}
