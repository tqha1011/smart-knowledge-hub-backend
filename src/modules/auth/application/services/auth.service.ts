import { MailerService } from '@nestjs-modules/mailer';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomInt } from 'crypto';
import { Result, err, ok } from 'neverthrow';
import { User } from 'src/modules/user/domain/entities/user.entity';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { SystemRole } from 'src/shared/domain/enum';
import { NotificationService } from 'src/shared/infrastructure/notification/notification.service';
import {
  IPasswordHasher,
  IRefreshTokenProvider,
  IRefreshTokenRepository,
  ITokenProvider,
} from '../../domain/repositories/auth.interface';
import {
  CreateUserByAdminDto,
  LoginDto,
  RegisterDto,
  SetPasswordRequestDto,
} from '../dtos/auth.dto';
import {
  AuthTokens,
  IAuthService,
  OtpVerifiedResult,
} from '../interfaces/auth.service.interface';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheKey } from 'src/shared/domain/cacheKey';
import type { Cache } from 'cache-manager';

const TEMP_PASSWORD_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid look-alikes
const TEMP_PASSWORD_LOWER = 'abcdefghijkmnpqrstuvwxyz';
const TEMP_PASSWORD_DIGITS = '23456789';
const TEMP_PASSWORD_SPECIAL = '@$!%*?&';
const TEMP_PASSWORD_LENGTH = 12;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const REFRESH_TOKEN_DEFAULT_DAYS = 30;

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenProvider: ITokenProvider,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly refreshTokenProvider: IRefreshTokenProvider,
    private readonly userRepository: IUserRepository,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}
  async verifyOtpAsync(
    email: string,
    otp: string,
  ): Promise<Result<OtpVerifiedResult, AppError>> {
    const user = await this.userRepository.GetUserByEmail(email);
    if (user.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    if (user.value === null) {
      return err(new AppError(ErrorCode.BadRequest, 'Invalid credentials'));
    }
    const otpKey = CacheKey.generateOtpKey(email);
    const cachedOtp = await this.cacheManager.get<string>(otpKey);
    if (cachedOtp !== otp || cachedOtp === undefined) {
      return err(
        new AppError(ErrorCode.BadRequest, 'Invalid OTP or OTP is expired.'),
      );
    }
    await this.cacheManager.del(otpKey);

    const resetToken = randomBytes(32).toString('hex');
    await this.cacheManager.set(
      CacheKey.generateResetTokenKey(email),
      resetToken,
      RESET_TOKEN_TTL_MS,
    );
    return ok({ resetToken });
  }

  async recoverPasswordAsync(
    email: string,
    resetToken: string,
    newPassword: string,
  ): Promise<Result<undefined, AppError>> {
    const user = await this.userRepository.GetUserByEmail(email);
    if (user.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    if (user.value === null) {
      return err(new AppError(ErrorCode.BadRequest, 'Invalid credentials'));
    }

    const resetTokenKey = CacheKey.generateResetTokenKey(email);
    const cachedResetToken = await this.cacheManager.get<string>(resetTokenKey);
    if (cachedResetToken !== resetToken || cachedResetToken === undefined) {
      return err(
        new AppError(ErrorCode.BadRequest, 'Invalid or expired reset token.'),
      );
    }
    await this.cacheManager.del(resetTokenKey);

    const newPasswordHashResult =
      await this.passwordHasher.GenerateHashPassword(newPassword);
    if (newPasswordHashResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to hash new password.',
        ),
      );
    }

    const result = await this.userRepository.updatePasswordAsync(
      user.value.id,
      newPasswordHashResult.value,
    );
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to update password.',
        ),
      );
    }
    return ok(undefined);
  }
  async setPasswordAsync(
    setPasswordRequestDto: SetPasswordRequestDto,
    userPublicId: string,
  ): Promise<Result<undefined, AppError>> {
    const userData =
      await this.userRepository.getUserPasswordAsync(userPublicId);

    if (userData.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to retrieve user data.',
        ),
      );
    }
    if (!userData.value) {
      return err(new AppError(ErrorCode.NotFound, 'User not found.'));
    }
    const isMatchedResult = await this.passwordHasher.VerifyPassword(
      setPasswordRequestDto.oldPassword,
      userData.value.passwordHashed,
    );
    if (isMatchedResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to verify old password.',
        ),
      );
    }
    if (!isMatchedResult.value) {
      return err(new AppError(ErrorCode.Unauthorized, 'Invalid old password.'));
    }
    const newPasswordHashResult =
      await this.passwordHasher.GenerateHashPassword(
        setPasswordRequestDto.newPassword,
      );
    if (newPasswordHashResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to hash new password.',
        ),
      );
    }
    const newPasswordHash = newPasswordHashResult.value;
    const result = await this.userRepository.updatePasswordAsync(
      userData.value.id,
      newPasswordHash,
    );
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to update password.',
        ),
      );
    }
    return ok(undefined);
  }

  async sendOtpAsync(email: string): Promise<Result<undefined, AppError>> {
    const user = await this.userRepository.GetUserByEmail(email);
    if (user.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    if (user.value === null) {
      return err(new AppError(ErrorCode.BadRequest, 'Invalid credentials'));
    }
    return this.notificationService.sendOtpAsync(email, user.value.username);
  }

  async registerAsync(
    registerDto: RegisterDto,
  ): Promise<Result<undefined, AppError>> {
    const emailExists = await this.userRepository.CheckUserExistsByEmail(
      registerDto.email,
    );
    if (emailExists.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    if (emailExists.value) {
      return err(new AppError(ErrorCode.Conflict, 'Email already exists.'));
    }
    // Continue with registration logic
    const passwordHashResult = await this.passwordHasher.GenerateHashPassword(
      registerDto.password,
    );
    if (passwordHashResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    const passwordHash = passwordHashResult.value;
    const newUser = User.create({
      email: registerDto.email,
      username: registerDto.username,
      password: passwordHash,
      role: SystemRole.Employee,
    });
    if (newUser.isErr()) {
      return err(new AppError(ErrorCode.BadRequest, newUser.error.message));
    }
    const addUserResult = await this.userRepository.AddUser(newUser.value);
    if (addUserResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    return ok(undefined);
  }

  async loginAsync(loginDto: LoginDto): Promise<Result<AuthTokens, AppError>> {
    const user = await this.userRepository.GetUserByEmail(loginDto.email);
    if (user.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    if (user.value === null) {
      return err(
        new AppError(ErrorCode.BadRequest, 'Invalid login credentials.'),
      );
    }
    const matchingPasswordResult = await this.passwordHasher.VerifyPassword(
      loginDto.password,
      user.value.password,
    );
    if (matchingPasswordResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    // If the password does not match, return an error
    if (!matchingPasswordResult.value) {
      return err(
        new AppError(ErrorCode.BadRequest, 'Invalid login credentials.'),
      );
    }
    const tokenResult = await this.tokenProvider.GenerateAccessToken(
      user.value.publicId,
      user.value.email,
      user.value.role,
    );
    if (tokenResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }

    const refreshTokenResult = await this.issueRefreshToken(
      user.value.id,
      loginDto.rememberMe,
    );
    if (refreshTokenResult.isErr()) {
      return err(refreshTokenResult.error);
    }

    return ok({
      accessToken: tokenResult.value,
      refreshToken: refreshTokenResult.value,
    });
  }

  async refreshTokenAsync(
    refreshToken: string,
  ): Promise<Result<AuthTokens, AppError>> {
    const tokenHash = this.refreshTokenProvider.hash(refreshToken);
    const recordResult =
      await this.refreshTokenRepository.GetRefreshTokenByHash(tokenHash);
    if (recordResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    const record = recordResult.value;
    if (record === null) {
      return err(new AppError(ErrorCode.BadRequest, 'Invalid refresh token.'));
    }
    if (record.revokedAt !== null) {
      // Reuse of an already-rotated-out or already-logged-out token is a
      // theft signal: revoke every session for this user, not just this one.
      const revokeAllResult =
        await this.refreshTokenRepository.RevokeAllRefreshTokensForUser(
          record.userId,
        );
      if (revokeAllResult.isErr()) {
        this.logger.error(
          'Failed to revoke all refresh tokens after reuse detection',
          revokeAllResult.error,
        );
      }
      return err(
        new AppError(
          ErrorCode.Unauthorized,
          'Invalid refresh token. All sessions have been revoked for security.',
        ),
      );
    }
    if (record.expiresAt.getTime() < Date.now()) {
      return err(
        new AppError(ErrorCode.BadRequest, 'Refresh token has expired.'),
      );
    }

    const userAuthDataResult = await this.userRepository.GetUserAuthDataById(
      record.userId,
    );
    if (userAuthDataResult.isErr() || userAuthDataResult.value === null) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    const userAuthData = userAuthDataResult.value;

    const newAccessTokenResult = await this.tokenProvider.GenerateAccessToken(
      userAuthData.publicId,
      userAuthData.email,
      userAuthData.role,
    );
    if (newAccessTokenResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }

    const revokeResult = await this.refreshTokenRepository.RevokeRefreshToken(
      record.publicId,
    );
    if (revokeResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }

    const newRefreshTokenResult = await this.issueRefreshToken(
      record.userId,
      false,
    );
    if (newRefreshTokenResult.isErr()) {
      return err(newRefreshTokenResult.error);
    }

    return ok({
      accessToken: newAccessTokenResult.value,
      refreshToken: newRefreshTokenResult.value,
    });
  }

  async logoutAsync(
    refreshToken: string,
  ): Promise<Result<undefined, AppError>> {
    const tokenHash = this.refreshTokenProvider.hash(refreshToken);
    const recordResult =
      await this.refreshTokenRepository.GetRefreshTokenByHash(tokenHash);
    if (recordResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    const record = recordResult.value;
    if (record === null || record.revokedAt !== null) {
      // Idempotent: already logged out / unknown token is the desired end state.
      return ok(undefined);
    }
    const revokeResult = await this.refreshTokenRepository.RevokeRefreshToken(
      record.publicId,
    );
    if (revokeResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    return ok(undefined);
  }

  /**
   * Generates a new opaque refresh token, persists its hash, and returns the
   * raw value to send back to the client.
   */
  private async issueRefreshToken(
    userId: number,
    rememberMe: boolean,
  ): Promise<Result<string, AppError>> {
    const { rawToken, tokenHash } = this.refreshTokenProvider.generate();
    const days = rememberMe
      ? REFRESH_TOKEN_DEFAULT_DAYS
      : Number(
          this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN_DAYS'),
        ) || REFRESH_TOKEN_DEFAULT_DAYS;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const addResult = await this.refreshTokenRepository.AddRefreshToken({
      userId,
      tokenHash,
      expiresAt,
    });
    if (addResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    return ok(rawToken);
  }

  async adminCreateUserAsync(
    createUserByAdminDto: CreateUserByAdminDto,
  ): Promise<Result<{ publicId: string }, AppError>> {
    const emailExists = await this.userRepository.CheckUserExistsByEmail(
      createUserByAdminDto.email,
    );
    if (emailExists.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }
    if (emailExists.value) {
      return err(new AppError(ErrorCode.Conflict, 'Email already exists.'));
    }

    const temporaryPassword = AuthService.generateTemporaryPassword();
    const passwordHashResult =
      await this.passwordHasher.GenerateHashPassword(temporaryPassword);
    if (passwordHashResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }

    const newUser = User.create({
      email: createUserByAdminDto.email,
      username: createUserByAdminDto.username,
      password: passwordHashResult.value,
      role: createUserByAdminDto.role ?? SystemRole.Employee,
    });
    if (newUser.isErr()) {
      return err(new AppError(ErrorCode.BadRequest, newUser.error.message));
    }

    const addUserResult = await this.userRepository.AddUser(newUser.value);
    if (addUserResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Server is currently unavailable. Please try again later.',
        ),
      );
    }

    // Best-effort: the account is already created, so a failure to deliver
    // the temporary password by email must not fail the request.
    try {
      await this.mailerService.sendMail({
        to: newUser.value.email,
        subject: 'Your Smart Knowledge Portal account',
        template: 'new-user-welcome',
        context: {
          userName: newUser.value.username,
          email: newUser.value.email,
          temporaryPassword,
          loginUrl: this.configService.get<string>('FRONTEND_URL'),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send welcome email to ${newUser.value.email}`,
        error,
      );
    }

    return ok({ publicId: newUser.value.publicId });
  }

  /**
   * Generates a random password that satisfies the same complexity rule
   * enforced on RegisterDto/LoginDto (upper, lower, digit, special, 8+ chars).
   */
  private static generateTemporaryPassword(): string {
    const pickChar = (chars: string) => chars[randomInt(chars.length)];
    const passwordChars = [
      pickChar(TEMP_PASSWORD_UPPER),
      pickChar(TEMP_PASSWORD_LOWER),
      pickChar(TEMP_PASSWORD_DIGITS),
      pickChar(TEMP_PASSWORD_SPECIAL),
    ];
    const allChars =
      TEMP_PASSWORD_UPPER +
      TEMP_PASSWORD_LOWER +
      TEMP_PASSWORD_DIGITS +
      TEMP_PASSWORD_SPECIAL;
    while (passwordChars.length < TEMP_PASSWORD_LENGTH) {
      passwordChars.push(pickChar(allChars));
    }
    // Fisher-Yates shuffle so the fixed-class characters aren't always first.
    for (let i = passwordChars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [passwordChars[i], passwordChars[j]] = [
        passwordChars[j],
        passwordChars[i],
      ];
    }
    return passwordChars.join('');
  }
}
