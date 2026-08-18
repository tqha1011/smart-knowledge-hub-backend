import { Module } from '@nestjs/common';
import { CategoryModule } from 'src/modules/category/category.module';
import { KnowledgeSpaceModule } from 'src/modules/knowledge-space/knowledgeSpace.module';
import { PrismaModule } from 'src/shared/infrastructure/database/prisma.module';
import { StorageModule } from 'src/shared/infrastructure/storage/storage.module';
import { IDocumentQueryRepository } from './application/interfaces/document-query.repo.interface';
import { IDocumentService } from './application/interfaces/document.service.interface';
import { DocumentService } from './application/services/document.service';
import { IDocumentRepository } from './domain/repositories/document.repo.interface';
import { DocumentRepository } from './infrastructure/document.repo';

@Module({
  imports: [PrismaModule, CategoryModule, KnowledgeSpaceModule, StorageModule],
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
    {
      provide: IDocumentService,
      useClass: DocumentService,
    },
  ],
  exports: [IDocumentRepository, IDocumentQueryRepository, IDocumentService],
})
export class DocumentModule {}
