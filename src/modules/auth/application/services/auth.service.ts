import { Injectable } from '@nestjs/common';
import { Result, err, ok } from 'neverthrow';
import { User } from 'src/modules/user/domain/entities/user.entity';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { SystemRole } from 'src/shared/domain/enum';
import {
  IPasswordHasher,
  ITokenProvider,
} from '../../domain/repositories/auth.interface';
import { LoginDto, RegisterDto } from '../dtos/auth.dto';
import { IAuthService } from '../interfaces/auth.service.interface';

@Injectable()
export class AuthService implements IAuthService {
  constructor(
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenProvider: ITokenProvider,
    private readonly userRepository: IUserRepository,
  ) {}

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

  async loginAsync(loginDto: LoginDto): Promise<Result<string, AppError>> {
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
    return ok(tokenResult.value);
  }
}
