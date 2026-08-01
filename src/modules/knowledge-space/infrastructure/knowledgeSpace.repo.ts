import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WorkSpaceRole } from 'generated/prisma/enums';
import { err, ok, Result } from 'neverthrow';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { KnowledgeSpace } from '../domain/entities/knowledgeSpace.entity';
import { IKnowledgeSpaceRepository } from '../domain/repositories/knowledgeSpace.repo.interface';

function mapUserRoleToCommonRole(role: WorkSpaceRole): KnowledgeSpaceRole {
  switch (role) {
    case WorkSpaceRole.Owner:
      return KnowledgeSpaceRole.Owner;
    case WorkSpaceRole.Editor:
      return KnowledgeSpaceRole.Editor;
    case WorkSpaceRole.Viewer:
      return KnowledgeSpaceRole.Viewer;
    default:
      throw new Error('Unknown role');
  }
}

function mapCommonRoleToUserRole(role: KnowledgeSpaceRole): WorkSpaceRole {
  switch (role) {
    case KnowledgeSpaceRole.Owner:
      return WorkSpaceRole.Owner;
    case KnowledgeSpaceRole.Editor:
      return WorkSpaceRole.Editor;
    case KnowledgeSpaceRole.Viewer:
      return WorkSpaceRole.Viewer;
    default:
      throw new Error('Unknown role');
  }
}
export class KnowledgeSpaceRepository implements IKnowledgeSpaceRepository {
  constructor(private readonly prismaService: PrismaService) {}
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
          type: newKnowledgeSpace.type,
          createdBy: createbyUserId,
          createdAt: newKnowledgeSpace.createdAt,
          updatedAt: newKnowledgeSpace.updatedAt,
          userWorkspaces: {
            create: {
              publicId: randomUUID(),
              userId: createbyUserId,
              role: mapCommonRoleToUserRole(KnowledgeSpaceRole.Owner),
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
      return ok(mapUserRoleToCommonRole(userRole.role));
    } catch (error) {
      this.logger.error(
        'Failed to get user knowledge space role in repository',
        error,
      );
      return err(new Error('Failed to get user knowledge space role'));
    }
  }
  async updateKnowledgeSpace(
    updatedKnowledgeSpace: KnowledgeSpace,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.knowledgeSpace.update({
        where: {
          id: updatedKnowledgeSpace.id,
        },
        data: {
          name: updatedKnowledgeSpace.name,
          description: updatedKnowledgeSpace.description,
          type: updatedKnowledgeSpace.type,
          updatedAt: updatedKnowledgeSpace.updatedAt,
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
