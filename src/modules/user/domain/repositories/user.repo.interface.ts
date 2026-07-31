import { Result } from 'neverthrow';
import { User } from '../entities/user.entity';

export abstract class IUserRepository {
  abstract AddUser(newUser: User): Promise<Result<undefined, Error>>;
  abstract GetUserByEmail(email: string): Promise<Result<User | null, Error>>;

  abstract CheckUserExistsByEmail(
    email: string,
  ): Promise<Result<boolean, Error>>;
}
