import { Result } from 'neverthrow';
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
  ): Promise<Result<string, Error>>;
}
