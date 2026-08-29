import { Result } from 'neverthrow';
import { SystemRole } from 'src/shared/domain/enum';

export abstract class IPasswordHasher {
  abstract GenerateHashPassword(
    password: string,
  ): Promise<Result<string, Error>>;

  abstract VerifyPassword(
    password: string,
    hashedPassword: string,
  ): Promise<Result<boolean, Error>>;
}

export abstract class ITokenProvider {
  abstract GenerateAccessToken(
    userPublicId: string,
    email: string,
    role: SystemRole,
  ): Promise<Result<string, Error>>;
}
