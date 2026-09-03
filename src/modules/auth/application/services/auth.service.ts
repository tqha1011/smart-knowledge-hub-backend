import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { Result, err, ok } from 'neverthrow';
import { User } from 'src/modules/user/domain/entities/user.entity';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { SystemRole } from 'src/shared/domain/enum';
import {
  IPasswordHasher,
  ITokenProvider,
} from '../../domain/repositories/auth.interface';
import {
  CreateUserByAdminDto,
  LoginDto,
  RegisterDto,
  SetPasswordRequestDto,
} from '../dtos/auth.dto';
import { IAuthService } from '../interfaces/auth.service.interface';

const TEMP_PASSWORD_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid look-alikes
const TEMP_PASSWORD_LOWER = 'abcdefghijkmnpqrstuvwxyz';
const TEMP_PASSWORD_DIGITS = '23456789';
const TEMP_PASSWORD_SPECIAL = '@$!%*?&';
const TEMP_PASSWORD_LENGTH = 12;

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenProvider: ITokenProvider,
    private readonly userRepository: IUserRepository,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}
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
