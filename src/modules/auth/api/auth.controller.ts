import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { AuthService } from '../application/auth.service';
import { LoginDto, RegisterDto } from '../application/dtos/auth.dto';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ 'limitPerMinute-auth': { ttl: 60000, limit: 10 } })
  async register(@Body() registerDto: RegisterDto) {
    const result = await this.authService.registerAsync(registerDto);

    return result.match(
      () => {
        return { message: 'User registered successfully' };
      },
      (error: AppError) => {
        switch (error.code) {
          case ErrorCode.Conflict:
            throw new ConflictException(error.message, {
              cause: error,
              description: 'Email already exists.',
            });
          case ErrorCode.BadRequest:
            throw new BadRequestException(error.message, {
              cause: error,
              description: 'Invalid request data.',
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

  @ApiTags('auth')
  @Post('login')
  @Throttle({ 'limitPerMinute-auth': { ttl: 60000, limit: 10 } })
  async login(@Body() loginDto: LoginDto) {
    const result = await this.authService.loginAsync(loginDto);

    return result.match(
      (token: string) => {
        return { token };
      },
      (error: AppError) => {
        switch (error.code) {
          case ErrorCode.Unauthorized:
            throw new UnauthorizedException(error.message, {
              cause: error,
              description: 'Invalid email or password.',
            });
          default:
            this.logger.error('Unexpected error during login:', error.stack);
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
