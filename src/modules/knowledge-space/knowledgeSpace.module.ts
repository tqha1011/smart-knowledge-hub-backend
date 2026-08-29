import { Module } from '@nestjs/common';
import { KnowledgeSpaceTypeController } from './api/knowledgeSpace-type.controller';
import { KnowledgeSpaceController } from './api/knowledgeSpace.controller';
import { IKnowledgeSpaceTypeService } from './application/interfaces/knowledgeSpace-type.service.interface';
import { IKnowledgeSpaceQueryRepository } from './application/interfaces/knowledgeSpace-query.repo.interface';
import { IKnowledgeSpaceService } from './application/interfaces/knowledgeSpace.service.interface';
import { KnowledgeSpaceTypeService } from './application/services/knowledgeSpace-type.service';
import { KnowledgeSpaceService } from './application/services/knowledgeSpace.service';
import { IKnowledgeSpaceTypeRepository } from './domain/repositories/knowledgeSpace-type.repo.interface';
import { IKnowledgeSpaceRepository } from './domain/repositories/knowledgeSpace.repo.interface';
import { KnowledgeSpaceTypeRepository } from './infrastructure/knowledgeSpace-type.repo';
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
    {
      provide: IKnowledgeSpaceQueryRepository,
      useClass: KnowledgeSpaceRepository,
    },
    {
      provide: IKnowledgeSpaceTypeRepository,
      useClass: KnowledgeSpaceTypeRepository,
    },
    {
      provide: IKnowledgeSpaceTypeService,
      useClass: KnowledgeSpaceTypeService,
    },
  ],
  controllers: [KnowledgeSpaceController, KnowledgeSpaceTypeController],
  exports: [
    IKnowledgeSpaceRepository,
    IKnowledgeSpaceService,
    IKnowledgeSpaceQueryRepository,
    IKnowledgeSpaceTypeRepository,
    IKnowledgeSpaceTypeService,
  ],
})
export class KnowledgeSpaceModule {}
