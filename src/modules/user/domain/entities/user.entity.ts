import { UUID } from 'crypto';

import { err, ok, Result } from 'neverthrow';
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
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type UserCreateParams = {
  readonly email: string;
  readonly username: string;
  readonly password: string;
};

export class User {
  private constructor(private params: UserGetParams) {}

  static create(
    params: UserCreateParams,
  ): Result<User, UserDomainValidationError> {
    // Implementation for creating a new User instance
    if (params.email.length === 0 || params.email.indexOf('@') === -1) {
      return err(
        new UserDomainValidationError(
          UserDomainError.EmailNotValid,
          'Email is not valid',
        ),
      );
    }

    if (params.username.length === 0) {
      return err(
        new UserDomainValidationError(
          UserDomainError.UsernameNotValid,
          'Username is not valid',
        ),
      );
    }

    if (params.password.length < 8) {
      return err(
        new UserDomainValidationError(
          UserDomainError.PasswordTooWeak,
          'Password is too weak',
        ),
      );
    }

    // If all validations pass, create the User instance
    return ok(
      new User({
        ...params,
        id: 0,
        publicId: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  }

  static getUser(params: UserGetParams): User {
    return new User(params);
  }

  getId(): number {
    return this.params.id;
  }

  getPublicId(): UUID {
    return this.params.publicId;
  }

  getEmail(): string {
    return this.params.email;
  }

  getUsername(): string {
    return this.params.username;
  }

  getCreatedAt(): Date {
    return this.params.createdAt;
  }

  getUpdatedAt(): Date {
    return this.params.updatedAt;
  }

  getPassword(): string {
    return this.params.password;
  }
}
