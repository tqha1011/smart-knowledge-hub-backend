import { Result } from 'neverthrow';
import { UserResponseDto } from '../dtos/user..response.dto';

export abstract class IUserQueryRepository {
  abstract GetUserByEmail(
    email: string,
  ): Promise<Result<UserResponseDto | null, Error>>;

  abstract GetUserByPublicId(
    publicId: string,
  ): Promise<Result<UserResponseDto | null, Error>>;
}
