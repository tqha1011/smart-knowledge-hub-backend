import { Module } from '@nestjs/common';
import { CategoryModule } from 'src/modules/category/category.module';
import { KnowledgeSpaceModule } from 'src/modules/knowledge-space/knowledgeSpace.module';
import { PrismaModule } from 'src/shared/infrastructure/database/prisma.module';
import { StorageModule } from 'src/shared/infrastructure/storage/storage.module';
import { UserModule } from 'src/modules/user/user.module';
import { DocumentPermissionController } from './api/document-permission.controller';
import { DocumentController } from './api/document.controller';
import { IDocumentPermissionService } from './application/interfaces/document-permission.service.interface';
import { IDocumentQueryRepository } from './application/interfaces/document-query.repo.interface';
import { IDocumentService } from './application/interfaces/document.service.interface';
import { DocumentPermissionService } from './application/services/document-permission-service';
import { DocumentService } from './application/services/document.service';
import { IDocumentPermissionRepository } from './domain/repositories/document-permission.repo.interface';
import { IDocumentRepository } from './domain/repositories/document.repo.interface';
import { DocumentPermissionRepository } from './infrastructure/document-permission.repo';
import { DocumentRepository } from './infrastructure/document.repo';

@Module({
  imports: [
    PrismaModule,
    CategoryModule,
    KnowledgeSpaceModule,
    StorageModule,
    UserModule,
  ],
  controllers: [DocumentController, DocumentPermissionController],
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
      provide: IDocumentPermissionRepository,
      useClass: DocumentPermissionRepository,
    },
    {
      provide: IDocumentService,
      useClass: DocumentService,
    },
    {
      provide: IDocumentPermissionService,
      useClass: DocumentPermissionService,
    },
  ],
  exports: [
    IDocumentRepository,
    IDocumentQueryRepository,
    IDocumentService,
    IDocumentPermissionService,
  ],
})
export class DocumentModule {}
