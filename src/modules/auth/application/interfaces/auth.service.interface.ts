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

export abstract class IAuthService {
  abstract registerAsync(
    registerDto: RegisterDto,
  ): Promise<Result<undefined, AppError>>;

  abstract loginAsync(loginDto: LoginDto): Promise<Result<string, AppError>>;

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
