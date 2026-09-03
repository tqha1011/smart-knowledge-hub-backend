import { Result } from 'neverthrow';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import {
  KnowledgeSpace,
  KnowledgeSpaceUpdateParams,
} from '../entities/knowledgeSpace.entity';

export type KnowledgeSpaceMembership = {
  readonly userId: number;
  readonly knowledgeSpaceId: number;
  readonly role: KnowledgeSpaceRole;
};
export abstract class IKnowledgeSpaceRepository {
  abstract create(
    newKnowledgeSpace: KnowledgeSpace,
    createbyUserId: number,
  ): Promise<Result<undefined, Error>>;

  abstract getKnowledgeSpaceIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>>;

  abstract getUserKnowledgeSpaceRole(
    userId: number,
    knowledgeSpaceId: number,
  ): Promise<Result<KnowledgeSpaceRole | null, Error>>;

  abstract updateKnowledgeSpace(
    knowledgeSpaceId: number,
    params: KnowledgeSpaceUpdateParams,
  ): Promise<Result<undefined, Error>>;

  abstract getKnowledgeSpaceTypeIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>>;

  abstract getMembershipInKnowledgeSpace(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<KnowledgeSpaceMembership | null, Error>>;

  abstract getFaqDocumentId(
    knowledgeSpaceId: number,
  ): Promise<Result<number | null, Error>>;

  abstract setFaqDocumentId(
    knowledgeSpaceId: number,
    documentId: number,
  ): Promise<Result<undefined, Error>>;

  abstract getKnowledgeSpaceNameById(
    knowledgeSpaceId: number,
  ): Promise<Result<string | null, Error>>;
}
