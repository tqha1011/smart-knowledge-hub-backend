import { UUID } from 'crypto';
import { Result, err, ok } from 'neverthrow';
import { SystemRole } from 'src/shared/domain/enum';
import {
  UserDomainError,
  UserDomainValidationError,
} from '../errors/user-domain.error';

export type UserGetParams = {
  readonly id: number;
  readonly publicId: UUID;
  readonly email: string;
  readonly username: string;
  readonly password: string;
  readonly role: SystemRole;
  readonly createdAt: Date;
  updatedAt: Date;
};

export type UserCreateParams = {
  readonly email: string;
  readonly username: string;
  readonly password: string;
  readonly role: SystemRole;
};

export class User {
  private constructor(private params: UserGetParams) {}

  static create(
    params: UserCreateParams,
  ): Result<User, UserDomainValidationError> {
    const validationResult = validateInformation(params);
    if (validationResult.isErr()) {
      return err(validationResult.error);
    }

    const userGetParams: UserGetParams = {
      id: 0, // This should be set by the database upon creation
      publicId: crypto.randomUUID(),
      email: params.email,
      username: params.username,
      password: params.password,
      role: params.role,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return ok(new User(userGetParams));
  }

  static getUser(params: UserGetParams): User {
    return new User(params);
  }

  get role(): SystemRole {
    return this.params.role;
  }

  get id(): number {
    return this.params.id;
  }

  get publicId(): UUID {
    return this.params.publicId;
  }

  get email(): string {
    return this.params.email;
  }

  get username(): string {
    return this.params.username;
  }

  get password(): string {
    return this.params.password;
  }

  get createdAt(): Date {
    return this.params.createdAt;
  }

  get updatedAt(): Date {
    return this.params.updatedAt;
  }
}

function validateInformation(
  params: UserCreateParams,
): Result<undefined, UserDomainValidationError> {
  if (!params.password || params.password.length < 8) {
    return err(
      new UserDomainValidationError(
        UserDomainError.PasswordTooWeak,
        'Password must be at least 8 characters long',
      ),
    );
  }

  if (!params.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
    return err(
      new UserDomainValidationError(
        UserDomainError.InvalidEmailFormat,
        'Email format is invalid',
      ),
    );
  }

  if (!params.username || params.username.length < 3) {
    return err(
      new UserDomainValidationError(
        UserDomainError.UsernameTooShort,
        'Username must be at least 3 characters long',
      ),
    );
  }
  return ok(undefined);
}
