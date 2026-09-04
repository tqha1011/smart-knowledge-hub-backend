import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { UserInformationResponseDto } from '../dtos/user.response.dto';

export abstract class IUserService {
  /**
   * Returns the given user's public information. Only the authenticated
   * caller's own `publicId` should be passed in — this does not check
   * whether the caller is allowed to view someone else's information.
   */
  abstract getUserInformation(
    userPublicId: string,
  ): Promise<Result<UserInformationResponseDto, AppError>>;
}
