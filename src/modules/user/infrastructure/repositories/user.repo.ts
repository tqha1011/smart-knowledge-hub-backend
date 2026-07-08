import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { UserResponseDto } from '../../application/dtos/user..response.dto';
import { IUserQueryRepository } from '../../application/interfaces/user-query.repo.interface';
import { User } from '../../domain/entities/user.entity';
import { IUserRepository } from '../../domain/repositories/user.repo.interface';

export class UserRepository implements IUserRepository, IUserQueryRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async GetUserByPublicId(
    publicId: string,
  ): Promise<Result<UserResponseDto | null, Error>> {
    try {
      const userRecord = await this.prismaService.user.findUnique({
        where: { publicId },
      });
      if (!userRecord) {
        return ok(null);
      }
      const userResponse: UserResponseDto = {
        publicId: userRecord.publicId,
        email: userRecord.email,
        username: userRecord.username,
        createdAt: userRecord.createdAt,
        updatedAt: userRecord.updatedAt,
      };
      return ok(userResponse);
    } catch (error) {
      return err(new Error(`Error getting user by public ID. Error: ${error}`));
    }
  }
  async AddUser(newUser: User): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.user.create({
        data: {
          id: 0,
          publicId: newUser.getPublicId(),
          email: newUser.getEmail(),
          username: newUser.getUsername(),
          password: newUser.getPassword(),
          createdAt: newUser.getCreatedAt(),
          updatedAt: newUser.getUpdatedAt(),
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Error adding user. Error: ${error}`));
    }
  }
  async GetUserByEmail(
    email: string,
  ): Promise<Result<UserResponseDto | null, Error>> {
    try {
      const userRecord = await this.prismaService.user.findUnique({
        where: { email },
      });
      if (!userRecord) {
        return ok(null);
      }
      const userResponse: UserResponseDto = {
        publicId: userRecord.publicId,
        email: userRecord.email,
        username: userRecord.username,
        createdAt: userRecord.createdAt,
        updatedAt: userRecord.updatedAt,
      };
      return ok(userResponse);
    } catch (error) {
      return err(new Error(`Error getting user by email. Error: ${error}`));
    }
  }
  async CheckUserExistsByEmail(email: string): Promise<Result<boolean, Error>> {
    try {
      const userRecord = await this.prismaService.user.findUnique({
        where: { email },
      });
      return ok(!!userRecord);
    } catch (error) {
      return err(
        new Error(`Error checking if user exists by email. Error: ${error}`),
      );
    }
  }
  async GetUserIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>> {
    try {
      const userId = await this.prismaService.user.findUnique({
        where: { publicId },
        select: { id: true },
      });
      if (!userId) {
        return ok(null);
      }
      return ok(userId.id);
    } catch (error) {
      return err(
        new Error(`Error getting user ID by public ID. Error: ${error}`),
      );
    }
  }
}
