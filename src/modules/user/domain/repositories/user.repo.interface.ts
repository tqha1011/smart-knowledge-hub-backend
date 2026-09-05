import { Result } from 'neverthrow';
import { User } from '../entities/user.entity';

export type UserData = {
  readonly id: number;
  readonly name: string;
  readonly avatarUrl: string | null;
};

export type UserCredentials = {
  id: number;
  passwordHashed: string;
};

export type UserContactData = {
  readonly id: number;
  readonly email: string;
  readonly username: string;
};
export abstract class IUserRepository {
  abstract AddUser(newUser: User): Promise<Result<undefined, Error>>;

  abstract CheckUserExistsByEmail(
    email: string,
  ): Promise<Result<boolean, Error>>;

  abstract GetUserIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>>;

  abstract GetUserByEmail(email: string): Promise<Result<User | null, Error>>;

  abstract GetUserDataByPublicId(
    publicId: string,
  ): Promise<Result<UserData | null, Error>>;

  /** Order/length of the input is not preserved — a missing publicId is simply
   * absent from the result, so callers must match by `publicId`, not by index. */
  abstract GetUserIdsByPublicIds(
    publicIds: string[],
  ): Promise<Result<{ publicId: string; id: number }[], Error>>;

  /** Order/length of the input is not preserved — a missing id is simply
   * absent from the result, so callers must match by `id`, not by index. */
  abstract GetUsersContactDataByIds(
    ids: number[],
  ): Promise<Result<UserContactData[], Error>>;

  abstract getUserPasswordAsync(
    userPublicId: string,
  ): Promise<Result<UserCredentials | null, Error>>;

  abstract updatePasswordAsync(
    userId: number,
    newPasswordHash: string,
  ): Promise<Result<undefined, Error>>;

  abstract getUserIdsByEmails(
    emails: string[],
  ): Promise<Result<{ email: string; id: number }[], Error>>;
}
