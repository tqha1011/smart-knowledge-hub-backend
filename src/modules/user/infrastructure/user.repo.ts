import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { createHash, randomUUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { User } from '../domain/entities/user.entity';
import { IUserRepository } from '../domain/repositories/user.repo.interface';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}
  async GetUserIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>> {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { publicId },
        select: { id: true },
      });
      if (!user) {
        return ok(null);
      }
      return ok(user.id);
    } catch (error) {
      return err(new Error(`Failed to get user ID by public ID. ${error}`));
    }
  }

  async AddUser(newUser: User): Promise<Result<undefined, Error>> {
    try {
      // generate profile image URL using Gravatar's identicon service
      const url =
        this.configService.get<string>('DEFAULT_PROFILE_IMAGE_URL') ??
        'https://www.gravatar.com/avatar/';
      const cleanEmail = newUser.email.trim().toLowerCase();
      const emailHash = createHash('sha256').update(cleanEmail).digest('hex');
      const imageUrl = `${url}/${emailHash}?d=identicon`;
      await this.prismaService.user.create({
        data: {
          publicId: newUser.publicId,
          email: newUser.email,
          username: newUser.username,
          password: newUser.password,
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt,
          profile: {
            create: {
              publicId: randomUUID(),
              description: 'Hello! I am new here.',
              displayName: newUser.username,
              imageUrl: imageUrl,
            },
          },
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to add user to the database. ${error}`));
    }
  }

  async CheckUserExistsByEmail(email: string): Promise<Result<boolean, Error>> {
    try {
      // findFirst = FistOrDefaultAsync in .NET Core
      const emailExists = await this.prismaService.user.count({
        where: { email },
      });
      return ok(emailExists > 0);
    } catch (error) {
      return err(
        new Error(`Failed to check if user exists by email. ${error}`),
      );
    }
  }
}
