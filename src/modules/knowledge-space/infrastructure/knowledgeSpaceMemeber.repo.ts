import { Injectable, Logger } from '@nestjs/common';
import { WorkSpaceRole } from 'generated/prisma/enums';
import { Result, err, ok } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  AddMembersRequest,
  IKnowledgeSpaceMemberRepository,
} from '../domain/repositories/knowledgeSpaceMember.repo.interface';
import { toPrismaRole } from './knowledgeSpace.mapper';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';

@Injectable()
export class KnowledgeSpaceMemberRepository implements IKnowledgeSpaceMemberRepository {
  private readonly logger = new Logger(KnowledgeSpaceMemberRepository.name);
  constructor(private readonly prismaService: PrismaService) {}
  async updateMemberRole(
    userId: number,
    knowledgeSpaceId: number,
    role: KnowledgeSpaceRole,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.userWorkspace.update({
        where: {
          unique_user_workspace_per_space: {
            userId,
            knowledgeSpaceId,
          },
        },
        data: {
          role: toPrismaRole(role),
          updatedAt: new Date(),
        },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to update member role', error);
      return err(new Error('Failed to update member role'));
    }
  }
  async addMembers(
    users: AddMembersRequest[],
    knowledgeSpaceId: number,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.userWorkspace.createMany({
        data: users.map((user) => ({
          userId: user.userId,
          knowledgeSpaceId,
          role: toPrismaRole(user.role),
        })),
        skipDuplicates: true, // Skip if the user is already a member of this space
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to add members to knowledge space', error);
      return err(new Error('Failed to add members to knowledge space'));
    }
  }
  async leaveKnowledgeSpace(
    userId: number,
    knowledgeSpaceId: number,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.userWorkspace.deleteMany({
        where: { userId, knowledgeSpaceId },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to leave knowledge space', error);
      return err(new Error('Failed to leave knowledge space'));
    }
  }
  async kickMembers(
    userIds: number[],
    knowledgeSpaceId: number,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.userWorkspace.deleteMany({
        where: { knowledgeSpaceId, userId: { in: userIds } },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to kick members from knowledge space', error);
      return err(new Error('Failed to kick members from knowledge space'));
    }
  }
  async countOwners(knowledgeSpaceId: number): Promise<Result<number, Error>> {
    try {
      const count = await this.prismaService.userWorkspace.count({
        where: { knowledgeSpaceId, role: WorkSpaceRole.Owner },
      });
      return ok(count);
    } catch (error) {
      this.logger.error('Failed to count owners of knowledge space', error);
      return err(new Error('Failed to count owners of knowledge space'));
    }
  }
}
