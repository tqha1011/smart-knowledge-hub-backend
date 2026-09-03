import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DocumentVisibility } from 'generated/prisma/enums';
import { err, ok, Result } from 'neverthrow';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  GetUserKnowledgeSpace,
  UserSpaceData,
} from '../application/dtos/knowledgeSpace.response.dto';
import { IKnowledgeSpaceQueryRepository } from '../application/interfaces/knowledgeSpace-query.repo.interface';
import {
  KnowledgeSpace,
  KnowledgeSpaceUpdateParams,
} from '../domain/entities/knowledgeSpace.entity';
import {
  IKnowledgeSpaceRepository,
  KnowledgeSpaceMembership,
} from '../domain/repositories/knowledgeSpace.repo.interface';
import { toDomainRole, toPrismaRole } from './knowledgeSpace.mapper';

@Injectable()
export class KnowledgeSpaceRepository
  implements IKnowledgeSpaceRepository, IKnowledgeSpaceQueryRepository
{
  constructor(private readonly prismaService: PrismaService) {}
  async getKnowledgeSpaceNameById(
    knowledgeSpaceId: number,
  ): Promise<Result<string | null, Error>> {
    try {
      const knowledgeSpace = await this.prismaService.knowledgeSpace.findUnique(
        {
          where: { id: knowledgeSpaceId },
          select: { name: true },
        },
      );
      return ok(knowledgeSpace?.name ?? null);
    } catch (error) {
      this.logger.error(
        'Failed to get knowledge space name by id in repository',
        error,
      );
      return err(new Error('Failed to get knowledge space name by id'));
    }
  }
  async getFaqDocumentId(
    knowledgeSpaceId: number,
  ): Promise<Result<number | null, Error>> {
    try {
      const knowledgeSpace = await this.prismaService.knowledgeSpace.findUnique(
        {
          where: { id: knowledgeSpaceId },
          select: { faqDocumentId: true },
        },
      );
      return ok(knowledgeSpace?.faqDocumentId ?? null);
    } catch (error) {
      this.logger.error(
        'Failed to get FAQ document id for knowledge space in repository',
        error,
      );
      return err(new Error('Failed to get FAQ document id'));
    }
  }
  async setFaqDocumentId(
    knowledgeSpaceId: number,
    documentId: number,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.knowledgeSpace.update({
        where: { id: knowledgeSpaceId },
        data: { faqDocumentId: documentId },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        'Failed to set FAQ document id for knowledge space in repository',
        error,
      );
      return err(new Error('Failed to set FAQ document id'));
    }
  }
  async getUserDataInKnowledgeSpace(
    knowledgeSpaceId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<UserSpaceData>, Error>> {
    try {
      const [userWorkspaces, totalUsers] =
        await this.prismaService.$transaction([
          this.prismaService.userWorkspace.findMany({
            where: { knowledgeSpaceId },
            select: {
              role: true,
              createdAt: true,
              user: {
                select: {
                  publicId: true,
                  username: true,
                  email: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            skip: (pagination.pageNumber - 1) * pagination.pageSize,
            take: pagination.pageSize,
          }),
          this.prismaService.userWorkspace.count({
            where: { knowledgeSpaceId },
          }),
        ]);
      const response: UserSpaceData[] = userWorkspaces.map((uw) => ({
        publicId: uw.user.publicId,
        name: uw.user.username,
        email: uw.user.email,
        role: toDomainRole(uw.role),
        joinedAt: uw.createdAt,
      }));
      return ok(
        new PageResult<UserSpaceData>(
          response,
          totalUsers,
          pagination.pageNumber,
          pagination.pageNumber,
          pagination.pageSize,
        ),
      );
    } catch (error) {
      this.logger.error(
        'Failed to get user data in knowledge space in repository',
        error,
      );
      return err(new Error('Failed to get user data in knowledge space'));
    }
  }
  async getMembershipInKnowledgeSpace(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<KnowledgeSpaceMembership | null, Error>> {
    try {
      const member = await this.prismaService.userWorkspace.findFirst({
        where: {
          user: {
            publicId: userPublicId,
          },
          knowledgeSpace: {
            publicId: knowledgeSpacePublicId,
          },
        },
        select: {
          knowledgeSpaceId: true,
          userId: true,
          role: true,
        },
      });
      if (!member) {
        return ok(null);
      }
      return ok({
        userId: member.userId,
        knowledgeSpaceId: member.knowledgeSpaceId,
        role: toDomainRole(member.role),
      });
    } catch (error) {
      this.logger.error(
        'Failed to get membership in knowledge space in repository',
        error,
      );
      return err(new Error('Failed to get membership in knowledge space'));
    }
  }
  async getKnowledgeSpacesForUser(
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<GetUserKnowledgeSpace>, Error>> {
    try {
      const [knowledgeSpaces, totalKnowledgeSpaces] =
        await this.prismaService.$transaction([
          this.prismaService.knowledgeSpace.findMany({
            where: {
              userWorkspaces: {
                some: {
                  user: {
                    publicId: userPublicId,
                  },
                },
              },
            },
            select: {
              publicId: true,
              name: true,
              description: true,
              userWorkspaces: {
                where: {
                  user: {
                    publicId: userPublicId,
                  },
                },
                select: {
                  role: true,
                },
              },
              _count: {
                select: {
                  documents: {
                    where: {
                      OR: [
                        { visibility: DocumentVisibility.Public },
                        {
                          visibility: DocumentVisibility.Restricted,
                          documentPermissions: {
                            some: {
                              user: {
                                publicId: userPublicId,
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            skip: (pagination.pageNumber - 1) * pagination.pageSize,
            take: pagination.pageSize,
          }),
          this.prismaService.knowledgeSpace.count({
            where: {
              userWorkspaces: {
                some: {
                  user: {
                    publicId: userPublicId,
                  },
                },
              },
            },
          }),
        ]);
      const response: GetUserKnowledgeSpace[] = knowledgeSpaces.map((ks) => ({
        publicId: ks.publicId,
        name: ks.name,
        totalDocuments: ks._count.documents,
        role: toDomainRole(ks.userWorkspaces[0].role),
      }));
      return ok(
        new PageResult<GetUserKnowledgeSpace>(
          response,
          totalKnowledgeSpaces,
          pagination.pageNumber,
          pagination.pageNumber,
          pagination.pageSize,
        ),
      );
    } catch (error) {
      this.logger.error(
        'Failed to get knowledge spaces for user in repository',
        error,
      );
      return err(new Error('Failed to get knowledge spaces for user'));
    }
  }
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
}
