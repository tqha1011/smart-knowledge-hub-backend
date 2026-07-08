import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { LoginDto, RegisterDto } from '../dtos/auth.dto';

export abstract class IAuthService {
  abstract registerAsync(
    registerDto: RegisterDto,
  ): Promise<Result<undefined, AppError>>;

  abstract loginAsync(loginDto: LoginDto): Promise<Result<string, AppError>>;
}
