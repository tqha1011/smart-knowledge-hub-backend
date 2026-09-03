import { Result } from 'neverthrow';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';

export type AddMembersRequest = {
  userId: number;
  role: KnowledgeSpaceRole;
};
export abstract class IKnowledgeSpaceMemberRepository {
  abstract addMembers(
    users: AddMembersRequest[],
    knowledgeSpaceId: number,
  ): Promise<Result<undefined, Error>>;

  abstract leaveKnowledgeSpace(
    userId: number,
    knowledgeSpaceId: number,
  ): Promise<Result<undefined, Error>>;

  abstract kickMembers(
    userIds: number[],
    knowledgeSpaceId: number,
  ): Promise<Result<undefined, Error>>;

  abstract countOwners(
    knowledgeSpaceId: number,
  ): Promise<Result<number, Error>>;
}
