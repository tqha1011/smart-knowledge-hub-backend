import { Module } from '@nestjs/common';
import { IDocumentRepository } from './domain/repositories/document.repo.interface';
import { DocumentRepository } from './infrastructure/document.repo';

@Module({
  imports: [],
  controllers: [],
  providers: [
    {
      provide: IDocumentRepository,
      useClass: DocumentRepository,
    },
  ],
  exports: [IDocumentRepository],
})
export class DocumentModule {}
