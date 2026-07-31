import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { LoginDto, RegisterDto } from '../application/dtos/auth.dto';
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
}
