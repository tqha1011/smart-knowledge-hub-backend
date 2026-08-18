import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { hasAtLeastRole } from 'src/shared/domain/knowledgeSpace-role';
import { KnowledgeSpaceMembership } from '../../domain/repositories/knowledgeSpace.repo.interface';

export function authorizeMembership(
  memberShip: Result<KnowledgeSpaceMembership | null, Error>,
  minimumRole: KnowledgeSpaceRole,
  action: string,
): Result<KnowledgeSpaceMembership, AppError> {
  if (memberShip.isErr()) {
    return err(
      new AppError(
        ErrorCode.InternalServerError,
        'Failed to get membership in knowledge space',
      ),
    );
  }
  if (!memberShip.value) {
    return err(
      new AppError(ErrorCode.Forbidden, 'User does not have permission'),
    );
  }

  if (!hasAtLeastRole(memberShip.value.role, minimumRole)) {
    return err(
      new AppError(
        ErrorCode.Forbidden,
        `User does not have permission to ${action}`,
      ),
    );
  }
  return ok(memberShip.value);
}
