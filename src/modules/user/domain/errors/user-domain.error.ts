export enum UserDomainError {
  PasswordTooWeak = 'PASSWORD_TOO_WEAK',
  InvalidEmailFormat = 'INVALID_EMAIL_FORMAT',
  UsernameTooShort = 'USERNAME_TOO_SHORT',
}

export class UserDomainValidationError extends Error {
  constructor(
    public readonly error: UserDomainError,
    message: string,
  ) {
    super(message);
  }
}
