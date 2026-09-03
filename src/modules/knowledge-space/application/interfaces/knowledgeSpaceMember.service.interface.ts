import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { AddMemberRequestDto } from '../dtos/knowledgeSpace.request.dto';

export abstract class IKnowledgeSpaceMemberService {
  /** Only the Owner may add members. Public ids already a member are skipped. */
  abstract addMembersAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    members: AddMemberRequestDto[],
  ): Promise<Result<undefined, AppError>>;

  /**
   * Only the Owner may kick members. Rejects when doing so would leave the
   * knowledge space with no Owner.
   */
  abstract kickMembersAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    targetUserPublicIds: string[],
  ): Promise<Result<undefined, AppError>>;

  /**
   * Any member may leave. Rejects when the caller is the last Owner of the
   * knowledge space.
   */
  abstract leaveKnowledgeSpaceAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<undefined, AppError>>;

  /**
   * Only the Owner may change a member's role. Rejects when demoting the last
   * Owner of the knowledge space away from the Owner role.
   */
  abstract updateMemberRoleAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    targetUserPublicId: string,
    role: KnowledgeSpaceRole,
  ): Promise<Result<undefined, AppError>>;
}
