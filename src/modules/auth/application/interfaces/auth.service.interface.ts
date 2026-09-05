import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import {
  CreateUserByAdminDto,
  LoginDto,
  RegisterDto,
  SetPasswordRequestDto,
} from '../dtos/auth.dto';

export type OtpVerifiedResult = {
  resetToken: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export abstract class IAuthService {
  abstract registerAsync(
    registerDto: RegisterDto,
  ): Promise<Result<undefined, AppError>>;

  abstract loginAsync(
    loginDto: LoginDto,
  ): Promise<Result<AuthTokens, AppError>>;

  /**
   * Exchanges a valid, unused refresh token for a new access/refresh token
   * pair, revoking the presented token (rotation). If the presented token
   * was already revoked (rotated-out or logged-out) and is being replayed,
   * all of the owning user's refresh tokens are revoked as a theft signal.
   */
  abstract refreshTokenAsync(
    refreshToken: string,
  ): Promise<Result<AuthTokens, AppError>>;

  /**
   * Revokes the session tied to the given refresh token. Idempotent: a
   * missing or already-revoked token still returns success.
   */
  abstract logoutAsync(
    refreshToken: string,
  ): Promise<Result<undefined, AppError>>;

  /**
   * Creates a user with a generated temporary password, emailed to them.
   * Only an Admin may call this.
   */
  abstract adminCreateUserAsync(
    createUserByAdminDto: CreateUserByAdminDto,
  ): Promise<Result<{ publicId: string }, AppError>>;

  abstract setPasswordAsync(
    setPasswordRequestDto: SetPasswordRequestDto,
    userPublicId: string,
  ): Promise<Result<undefined, AppError>>;

  abstract sendOtpAsync(email: string): Promise<Result<undefined, AppError>>;

  /**
   * Verifies an OTP previously sent to the given email. On success, issues a
   * short-lived reset token that authorizes a single call to
   * `recoverPasswordAsync` without requiring the OTP again.
   */
  abstract verifyOtpAsync(
    email: string,
    otp: string,
  ): Promise<Result<OtpVerifiedResult, AppError>>;

  /**
   * Sets a new password for the given email using the reset token issued by
   * `verifyOtpAsync`. Used by the "forgot password" flow, where the caller
   * has no valid session/Bearer token.
   */
  abstract recoverPasswordAsync(
    email: string,
    resetToken: string,
    newPassword: string,
  ): Promise<Result<undefined, AppError>>;
}
