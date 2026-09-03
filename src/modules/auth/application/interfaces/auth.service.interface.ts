import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import {
  CreateUserByAdminDto,
  LoginDto,
  RegisterDto,
  SetPasswordRequestDto,
} from '../dtos/auth.dto';

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
}
