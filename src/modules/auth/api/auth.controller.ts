import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { JwtAuthGuard } from 'src/shared/common/jwt.guard';
import type { JwtPayload } from 'src/shared/common/jwt.payload.interface';
import { Roles } from 'src/shared/common/roles.decorator';
import { RolesGuard } from 'src/shared/common/roles.guard';
import { User } from 'src/shared/common/user.decorator';
import { SystemRole } from 'src/shared/domain/enum';
import {
  CreateUserByAdminDto,
  LoginDto,
  RecoveryPasswordRequestDto,
  RegisterDto,
  SendOtpRequestDto,
  SetPasswordRequestDto,
  VerifyOtpRequestDto,
} from '../application/dtos/auth.dto';
import { IAuthService } from '../application/interfaces/auth.service.interface';

@ApiTags('auth')
@Controller('api/auth/')
@UseGuards(ThrottlerGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: IAuthService) {}
  /**
   * Handles user login by validating credentials and returning an access token upon successful authentication.
   * @remarks
   * - Returns an access token if the login is successful.
   * - Throws a BadRequestException if the provided credentials are invalid.
   * - Throws an InternalServerErrorException for any unexpected errors during the login process.
   * @param loginDto
   * @returns string (access token) if successful, otherwise throws an appropriate HTTP exception with a descriptive message.
   * @throws {400} when the provided credentials are invalid.
   * @throws {500} for any unexpected errors during the login process.
   * @example
   * // Successful login
   * POST /api/auth/login
   * {
   *   "email": "user@example.com",
   *   "password": "Password123!"
   * }
   */
  @ApiOperation({ summary: 'Login with email and password' })
  @Post('login')
  @Throttle({ 'limitPerMinute-auth': { ttl: 60000, limit: 10 } })
  async login(@Body() loginDto: LoginDto) {
    const result = await this.authService.loginAsync(loginDto);
    return result.match(
      (token) => {
        return { accessToken: token };
      },
      (error: AppError) => {
        switch (error.code) {
          case ErrorCode.BadRequest:
            throw new BadRequestException(error.message, {
              cause: error,
              description: 'The provided credentials are invalid.',
            });
          default:
            this.logger.error('Unexpected error during login:', error);
            throw new InternalServerErrorException(error.message, {
              cause: error,
              description:
                'An unexpected error occurred while processing your request.',
            });
        }
      },
    );
  }

  /**
   * Handles user registration by creating a new user account with the provided email, username, and password.
   * @remarks
   * - Registers a new user with the provided email, username, and password.
   * - Returns a success message if the registration is successful.
   * - Throws a ConflictException if the email provided is already in use.
   * - Throws an InternalServerErrorException for any unexpected errors during the registration process.
   * @returns A success message if the registration is successful, otherwise throws an appropriate HTTP exception with a descriptive message.
   * @throws {409} when the email provided is already in use.
   * @throws {500} for any unexpected errors during the registration process.
   * @throws {400} when the provided registration data is invalid format.
   * @example
   * // Successful registration
   * POST /api/auth/register
   * {
   *  "email": "example@gmail.com",
   *  "username": "exampleUser",
   *  "password": "Password123!"
   * }
   * @param registerDto
   * @returns
   */
  @ApiOperation({ summary: 'Register a new user account' })
  @Post('register')
  @Throttle({ 'limitPerMinute-auth': { ttl: 60000, limit: 10 } })
  async register(@Body() registerDto: RegisterDto) {
    const result = await this.authService.registerAsync(registerDto);
    return result.match(
      () => {
        return { message: 'Register successful' };
      },
      (error: AppError) => {
        switch (error.code) {
          case ErrorCode.Conflict:
            throw new ConflictException(error.message, {
              cause: error,
              description: 'The email provided is already in use.',
            });
          default:
            this.logger.error(
              'Unexpected error during registration:',
              error.stack,
            );
            throw new InternalServerErrorException(error.message, {
              cause: error,
              description:
                'An unexpected error occurred while processing your request.',
            });
        }
      },
    );
  }

  /**
   * Creates a user account with a generated temporary password, emailed to
   * them. Only an Admin may call this.
   * @throws {400} when the provided data is invalid.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not an Admin.
   * @throws {409} when the email provided is already in use.
   * @throws {500} for any unexpected errors while creating the account.
   * @example
   * POST /api/auth/users
   * {
   *   "email": "example@gmail.com",
   *   "username": "exampleUser",
   *   "role": "Employee"
   * }
   */
  @ApiOperation({ summary: 'Create a user account (Admin only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles([SystemRole.Admin])
  @Post('users')
  async createUser(@Body() createUserByAdminDto: CreateUserByAdminDto) {
    const result =
      await this.authService.adminCreateUserAsync(createUserByAdminDto);
    return result.match(
      (user) => user,
      (error: AppError) => {
        switch (error.code) {
          case ErrorCode.Conflict:
            throw new ConflictException(error.message, {
              cause: error,
              description: 'The email provided is already in use.',
            });
          case ErrorCode.BadRequest:
            throw new BadRequestException(error.message, { cause: error });
          default:
            this.logger.error(
              'Unexpected error during admin user creation:',
              error.stack,
            );
            throw new InternalServerErrorException(error.message, {
              cause: error,
              description:
                'An unexpected error occurred while processing your request.',
            });
        }
      },
    );
  }

  /**
   * Changes the authenticated user's own password, given the current one.
   * @throws {400} when the new password fails validation.
   * @throws {401} when no valid bearer token is provided, or `oldPassword`
   * does not match.
   * @throws {404} when the authenticated user no longer exists.
   * @throws {500} for any unexpected errors while updating the password.
   * @example
   * PATCH /api/auth/password
   * {
   *   "oldPassword": "Password123!",
   *   "newPassword": "NewPassword456!"
   * }
   */
  @ApiOperation({ summary: "Change the caller's own password" })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Patch('password')
  async setPassword(
    @User() user: JwtPayload,
    @Body() setPasswordRequestDto: SetPasswordRequestDto,
  ) {
    const result = await this.authService.setPasswordAsync(
      setPasswordRequestDto,
      user.sub,
    );
    return result.match(
      () => ({ message: 'Password updated successfully' }),
      (error: AppError) => {
        switch (error.code) {
          case ErrorCode.Unauthorized:
            throw new UnauthorizedException(error.message, { cause: error });
          case ErrorCode.NotFound:
            throw new NotFoundException(error.message, { cause: error });
          default:
            this.logger.error(
              'Unexpected error during password update:',
              error.stack,
            );
            throw new InternalServerErrorException(error.message, {
              cause: error,
              description:
                'An unexpected error occurred while processing your request.',
            });
        }
      },
    );
  }

  /**
   * Sends a one-time verification code to the given email if an account
   * exists for it. Always responds with a generic success message so the
   * caller cannot use this endpoint to enumerate registered emails.
   * @throws {400} when the provided email is invalid, or no account exists for it.
   * @throws {500} for any unexpected errors while sending the OTP.
   * @example
   * POST /api/auth/otp/send
   * {
   *   "email": "example@gmail.com"
   * }
   */
  @ApiOperation({ summary: 'Send an OTP verification code to an email' })
  @Post('otp/send')
  @Throttle({ 'limitPerMinute-auth': { ttl: 60000, limit: 10 } })
  async sendOtp(@Body() sendOtpRequestDto: SendOtpRequestDto) {
    const result = await this.authService.sendOtpAsync(sendOtpRequestDto.email);
    return result.match(
      () => ({ message: 'OTP sent successfully' }),
      (error: AppError) => {
        switch (error.code) {
          case ErrorCode.BadRequest:
            throw new BadRequestException(error.message, { cause: error });
          default:
            this.logger.error(
              'Unexpected error while sending OTP:',
              error.stack,
            );
            throw new InternalServerErrorException(error.message, {
              cause: error,
              description:
                'An unexpected error occurred while processing your request.',
            });
        }
      },
    );
  }

  /**
   * Verifies a one-time code previously sent to the given email. On success,
   * returns a short-lived reset token to be passed to
   * `POST /api/auth/password/recovery` — the OTP itself is consumed and
   * cannot be reused.
   * @throws {400} when the OTP is invalid or expired, or no account exists for the given email.
   * @throws {500} for any unexpected errors while verifying the OTP.
   * @example
   * POST /api/auth/otp/verify
   * {
   *   "email": "example@gmail.com",
   *   "otp": "123456"
   * }
   */
  @ApiOperation({ summary: 'Verify an OTP code for an email' })
  @Post('otp/verify')
  @Throttle({ 'limitPerMinute-auth': { ttl: 60000, limit: 10 } })
  async verifyOtp(@Body() verifyOtpRequestDto: VerifyOtpRequestDto) {
    const result = await this.authService.verifyOtpAsync(
      verifyOtpRequestDto.email,
      verifyOtpRequestDto.otp,
    );
    return result.match(
      ({ resetToken }) => ({
        message: 'OTP verified successfully',
        resetToken,
      }),
      (error: AppError) => {
        switch (error.code) {
          case ErrorCode.BadRequest:
            throw new BadRequestException(error.message, { cause: error });
          default:
            this.logger.error(
              'Unexpected error while verifying OTP:',
              error.stack,
            );
            throw new InternalServerErrorException(error.message, {
              cause: error,
              description:
                'An unexpected error occurred while processing your request.',
            });
        }
      },
    );
  }

  /**
   * Sets a new password for an email using the reset token issued by
   * `POST /api/auth/otp/verify`. Used for the "forgot password" flow, where
   * the caller has no valid Bearer token.
   * @throws {400} when the reset token is invalid/expired, or no account exists for the given email.
   * @throws {500} for any unexpected errors while resetting the password.
   * @example
   * POST /api/auth/password/recovery
   * {
   *   "email": "example@gmail.com",
   *   "resetToken": "…",
   *   "newPassword": "NewPassword456!"
   * }
   */
  @ApiOperation({ summary: 'Reset a password via OTP-issued reset token' })
  @Post('password/recovery')
  @Throttle({ 'limitPerMinute-auth': { ttl: 60000, limit: 10 } })
  async recoverPassword(
    @Body() recoveryPasswordRequestDto: RecoveryPasswordRequestDto,
  ) {
    const result = await this.authService.recoverPasswordAsync(
      recoveryPasswordRequestDto.email,
      recoveryPasswordRequestDto.resetToken,
      recoveryPasswordRequestDto.newPassword,
    );
    return result.match(
      () => ({ message: 'Password reset successfully' }),
      (error: AppError) => {
        switch (error.code) {
          case ErrorCode.BadRequest:
            throw new BadRequestException(error.message, { cause: error });
          default:
            this.logger.error(
              'Unexpected error while recovering password:',
              error.stack,
            );
            throw new InternalServerErrorException(error.message, {
              cause: error,
              description:
                'An unexpected error occurred while processing your request.',
            });
        }
      },
    );
  }
}
