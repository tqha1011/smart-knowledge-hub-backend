import { Module } from '@nestjs/common';
import { KnowledgeSpaceModule } from 'src/modules/knowledge-space/knowledgeSpace.module';
import { PrismaModule } from 'src/shared/infrastructure/database/prisma.module';
import { CategoryController } from './api/category.controller';
import { ICategoryService } from './application/interfaces/category.service.interface';
import { CategoryService } from './application/services/category.service';
import { ICategoryRepository } from './domain/repositories/category.repo.interface';
import { CategoryRepository } from './infrastructure/category.repo';

@Module({
  imports: [PrismaModule, KnowledgeSpaceModule],
  controllers: [CategoryController],
  providers: [
    {
      provide: ICategoryRepository,
      useClass: CategoryRepository,
    },
    {
      provide: ICategoryService,
      useClass: CategoryService,
    },
  ],
  exports: [ICategoryRepository, ICategoryService],
})
export class CategoryModule {}
