import { Result } from 'neverthrow';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { KnowledgeSpace } from '../entities/knowledgeSpace.entity';

export abstract class IKnowledgeSpaceRepository {
  abstract create(
    newKnowledgeSpace: KnowledgeSpace,
    createbyUserId: number,
  ): Promise<Result<undefined, Error>>;

  abstract getUserKnowledgeSpaceRole(
    userId: number,
    knowledgeSpaceId: number,
  ): Promise<Result<KnowledgeSpaceRole | null, Error>>;

  abstract updateKnowledgeSpace(
    updatedKnowledgeSpace: KnowledgeSpace,
  ): Promise<Result<undefined, Error>>;
}
