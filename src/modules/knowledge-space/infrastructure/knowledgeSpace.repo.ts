import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { GetKnowledgeSpaceType } from '../application/dtos/knowledgeSpace.response.dto';
import { IKnowledgeSpaceQueryRepository } from '../application/interfaces/knowledgeSpace-query.repo.interface';
import {
  KnowledgeSpace,
  KnowledgeSpaceUpdateParams,
} from '../domain/entities/knowledgeSpace.entity';
import { IKnowledgeSpaceRepository } from '../domain/repositories/knowledgeSpace.repo.interface';
import { toDomainRole, toPrismaRole } from './knowledgeSpace.mapper';

export class KnowledgeSpaceRepository
  implements IKnowledgeSpaceRepository, IKnowledgeSpaceQueryRepository
{
  constructor(private readonly prismaService: PrismaService) {}
  async getKnowledgeSpaceTypeIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>> {
    try {
      const knowledgeSpaceType =
        await this.prismaService.knowledgeSpaceType.findUnique({
          where: {
            publicId,
          },
          select: {
            id: true,
          },
        });
      return ok(knowledgeSpaceType?.id ?? null);
    } catch (error) {
      this.logger.error(
        'Failed to get knowledge space type id by public id in repository',
        error,
      );
      return err(
        new Error('Failed to get knowledge space type id by public id'),
      );
    }
  }
  async getKnowledgeSpaceTypes(): Promise<
    Result<GetKnowledgeSpaceType[], Error>
  > {
    try {
      const knowledgeSpaceTypes =
        await this.prismaService.knowledgeSpaceType.findMany({
          select: {
            publicId: true,
            name: true,
          },
        });
      return ok(knowledgeSpaceTypes);
    } catch (error) {
      this.logger.error(
        'Failed to get knowledge space types in repository',
        error,
      );
      return err(new Error('Failed to get knowledge space types'));
    }
  }
  private readonly logger = new Logger(KnowledgeSpaceRepository.name);
  async create(
    newKnowledgeSpace: KnowledgeSpace,
    createbyUserId: number,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.knowledgeSpace.create({
        data: {
          publicId: newKnowledgeSpace.publicId,
          name: newKnowledgeSpace.name,
          description: newKnowledgeSpace.description,
          typeId: newKnowledgeSpace.typeId,
          createdAt: newKnowledgeSpace.createdAt,
          updatedAt: newKnowledgeSpace.updatedAt,
          userWorkspaces: {
            create: {
              publicId: randomUUID(),
              userId: createbyUserId,
              role: toPrismaRole(KnowledgeSpaceRole.Owner),
            },
          },
        },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        'Failed to create knowledge space in repository',
        error,
      );
      return err(new Error('Failed to create knowledge space'));
    }
  }
  async getKnowledgeSpaceIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>> {
    try {
      const knowledgeSpace = await this.prismaService.knowledgeSpace.findUnique(
        {
          where: {
            publicId,
          },
          select: {
            id: true,
          },
        },
      );
      return ok(knowledgeSpace?.id ?? null);
    } catch (error) {
      this.logger.error(
        'Failed to get knowledge space id by public id in repository',
        error,
      );
      return err(new Error('Failed to get knowledge space id by public id'));
    }
  }
  async getUserKnowledgeSpaceRole(
    userId: number,
    knowledgeSpaceId: number,
  ): Promise<Result<KnowledgeSpaceRole | null, Error>> {
    try {
      const userRole = await this.prismaService.userWorkspace.findFirst({
        where: {
          userId,
          knowledgeSpaceId,
        },
      });
      if (!userRole) {
        return ok(null);
      }
      return ok(toDomainRole(userRole.role));
    } catch (error) {
      this.logger.error(
        'Failed to get user knowledge space role in repository',
        error,
      );
      return err(new Error('Failed to get user knowledge space role'));
    }
  }
  async updateKnowledgeSpace(
    knowledgeSpaceId: number,
    params: KnowledgeSpaceUpdateParams,
  ): Promise<Result<undefined, Error>> {
    try {
      // updatedAt is maintained by Prisma through @updatedAt on the model.
      await this.prismaService.knowledgeSpace.update({
        where: {
          id: knowledgeSpaceId,
        },
        data: {
          name: params.name,
          description: params.description,
          typeId: params.typeId,
        },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        'Failed to update knowledge space in repository',
        error,
      );
      return err(new Error('Failed to update knowledge space'));
    }
  }

  async getKnowledgeSpaceTypeIdByName(
    name: string,
  ): Promise<Result<number | null, Error>> {
    try {
      const knowledgeSpaceType =
        await this.prismaService.knowledgeSpaceType.findUnique({
          where: { name },
          select: { id: true },
        });
      return ok(knowledgeSpaceType?.id ?? null);
    } catch (error) {
      this.logger.error(
        'Failed to get knowledge space type id by name in repository',
        error,
      );
      return err(new Error('Failed to get knowledge space type id by name'));
    }
  }
}
