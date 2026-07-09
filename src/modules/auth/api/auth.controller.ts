import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
} from '@nestjs/common';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { AuthService } from '../application/auth.service';
import { RegisterDto } from '../application/dtos/auth.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  @Post('register')
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
}
