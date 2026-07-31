import { Result } from 'neverthrow';
import { User } from '../entities/user.entity';

export abstract class IUserRepository {
  abstract AddUser(newUser: User): Promise<Result<undefined, Error>>;

  abstract CheckUserExistsByEmail(
    email: string,
  ): Promise<Result<boolean, Error>>;

  abstract GetUserIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>>;

  abstract GetUserByEmail(email: string): Promise<Result<User | null, Error>>;
}
