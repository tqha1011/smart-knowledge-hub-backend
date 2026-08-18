import { Module } from '@nestjs/common';
import { CategoryModule } from 'src/modules/category/category.module';
import { PrismaModule } from 'src/shared/infrastructure/database/prisma.module';
import { IDocumentQueryRepository } from './application/interfaces/document-query.repo.interface';
import { IDocumentRepository } from './domain/repositories/document.repo.interface';
import { DocumentRepository } from './infrastructure/document.repo';

@Module({
  imports: [PrismaModule, CategoryModule],
  controllers: [],
  providers: [
    {
      provide: IDocumentRepository,
      useClass: DocumentRepository,
    },
    {
      provide: IDocumentQueryRepository,
      useClass: DocumentRepository,
    },
  ],
  exports: [IDocumentRepository, IDocumentQueryRepository],
})
export class DocumentModule {}
