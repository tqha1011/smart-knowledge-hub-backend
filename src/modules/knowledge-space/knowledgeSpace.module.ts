import { Module } from '@nestjs/common';
import { KnowledgeSpaceTypeController } from './api/knowledgeSpace-type.controller';
import { KnowledgeSpaceController } from './api/knowledgeSpace.controller';
import { KnowledgeSpaceMemberController } from './api/knowledgeSpaceMember.controller';
import { IKnowledgeSpaceTypeService } from './application/interfaces/knowledgeSpace-type.service.interface';
import { IKnowledgeSpaceQueryRepository } from './application/interfaces/knowledgeSpace-query.repo.interface';
import { IKnowledgeSpaceService } from './application/interfaces/knowledgeSpace.service.interface';
import { IKnowledgeSpaceMemberService } from './application/interfaces/knowledgeSpaceMember.service.interface';
import { KnowledgeSpaceTypeService } from './application/services/knowledgeSpace-type.service';
import { KnowledgeSpaceService } from './application/services/knowledgeSpace.service';
import { KnowledgeSpaceMemberService } from './application/services/knowledgeSpaceMember.service';
import { IKnowledgeSpaceTypeRepository } from './domain/repositories/knowledgeSpace-type.repo.interface';
import { IKnowledgeSpaceRepository } from './domain/repositories/knowledgeSpace.repo.interface';
import { IKnowledgeSpaceMemberRepository } from './domain/repositories/knowledgeSpaceMember.repo.interface';
import { KnowledgeSpaceTypeRepository } from './infrastructure/knowledgeSpace-type.repo';
import { KnowledgeSpaceRepository } from './infrastructure/knowledgeSpace.repo';
import { KnowledgeSpaceMemberRepository } from './infrastructure/knowledgeSpaceMemeber.repo';

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
    {
      provide: IKnowledgeSpaceMemberRepository,
      useClass: KnowledgeSpaceMemberRepository,
    },
    {
      provide: IKnowledgeSpaceMemberService,
      useClass: KnowledgeSpaceMemberService,
    },
  ],
  controllers: [
    KnowledgeSpaceController,
    KnowledgeSpaceTypeController,
    KnowledgeSpaceMemberController,
  ],
  exports: [
    IKnowledgeSpaceRepository,
    IKnowledgeSpaceService,
    IKnowledgeSpaceQueryRepository,
    IKnowledgeSpaceTypeRepository,
    IKnowledgeSpaceTypeService,
    IKnowledgeSpaceMemberRepository,
    IKnowledgeSpaceMemberService,
  ],
})
export class KnowledgeSpaceModule {}
