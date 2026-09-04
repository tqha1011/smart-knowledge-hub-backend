import { Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { UserInformationResponseDto } from '../dtos/user.response.dto';
import { IUserQueryRepository } from '../interfaces/user-query.repo.interface';
import { IUserService } from '../interfaces/user.service.interface';

@Injectable()
export class UserService implements IUserService {
  constructor(private readonly userQueryRepository: IUserQueryRepository) {}

  async getUserInformation(
    userPublicId: string,
  ): Promise<Result<UserInformationResponseDto, AppError>> {
    const userInformationResult =
      await this.userQueryRepository.getUserInformationByPublicId(userPublicId);
    if (userInformationResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    const userInformation = userInformationResult.value;
    if (userInformation === null) {
      return err(new AppError(ErrorCode.NotFound, 'User not found.'));
    }
    return ok({
      ...userInformation,
      avatarInitials: userInformation.username.charAt(0).toUpperCase(),
    });
  }
}
