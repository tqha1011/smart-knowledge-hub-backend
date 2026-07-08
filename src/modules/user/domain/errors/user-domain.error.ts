export enum UserDomainError {
  EmailNotValid = 'EMAIL_NOT_VALID',
  UsernameNotValid = 'USERNAME_NOT_VALID',
  PasswordTooWeak = 'PASSWORD_TOO_WEAK',
}
export class UserDomainValidationError extends Error {
  constructor(
    public readonly error: UserDomainError,
    message: string,
  ) {
    super(message);
  }
}
