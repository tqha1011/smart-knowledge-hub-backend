import { Result } from 'neverthrow';
import {
  UserResponseDto,
  UserResponseWithPasswordDto,
} from '../dtos/user..response.dto';

export abstract class IUserQueryRepository {
  abstract GetUserByEmail(
    email: string,
  ): Promise<Result<UserResponseWithPasswordDto | null, Error>>;

  abstract GetUserByPublicId(
    publicId: string,
  ): Promise<Result<UserResponseDto | null, Error>>;
}
