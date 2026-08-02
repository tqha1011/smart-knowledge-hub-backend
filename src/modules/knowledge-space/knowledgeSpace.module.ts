import { Module } from '@nestjs/common';
import { KnowledgeSpaceController } from './api/knowledgeSpace.controller';
import { IKnowledgeSpaceService } from './application/interfaces/knowledgeSpace.service.interface';
import { KnowledgeSpaceService } from './application/services/knowledgeSpace.service';
import { IKnowledgeSpaceRepository } from './domain/repositories/knowledgeSpace.repo.interface';
import { KnowledgeSpaceRepository } from './infrastructure/knowledgeSpace.repo';

@Module({
  providers: [
    {
      provide: IKnowledgeSpaceRepository,
      useClass: KnowledgeSpaceRepository,
    },
    {
      provide: IKnowledgeSpaceService,
      useClass: KnowledgeSpaceService,
    },
  ],
  controllers: [KnowledgeSpaceController],
  exports: [IKnowledgeSpaceRepository, IKnowledgeSpaceService],
})
export class KnowledgeSpaceModule {}
