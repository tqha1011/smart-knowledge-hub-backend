import { Injectable, Logger } from '@nestjs/common';
import { WorkSpaceRole } from 'generated/prisma/enums';
import { Result, err, ok } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  AddMembersRequest,
  IKnowledgeSpaceMemberRepository,
} from '../domain/repositories/knowledgeSpaceMember.repo.interface';
import { toPrismaRole } from './knowledgeSpace.mapper';

@Injectable()
export class KnowledgeSpaceMemberRepository implements IKnowledgeSpaceMemberRepository {
  private readonly logger = new Logger(KnowledgeSpaceMemberRepository.name);
  constructor(private readonly prismaService: PrismaService) {}
  async addMembers(
    users: AddMembersRequest[],
    knowledgeSpaceId: number,
  ): Promise<Result<undefined, Error>> {
    try {
      const existingMembers = await this.prismaService.userWorkspace.findMany({
        where: {
          knowledgeSpaceId,
          userId: { in: users.map((user) => user.userId) },
        },
        select: { userId: true },
      });
      const existingUserIds = new Set(
        existingMembers.map((member) => member.userId),
      );
      const newUsers = users.filter(
        (user) => !existingUserIds.has(user.userId),
      );
      if (newUsers.length === 0) {
        return ok(undefined);
      }

      await this.prismaService.userWorkspace.createMany({
        data: newUsers.map((user) => ({
          userId: user.userId,
          knowledgeSpaceId,
          role: toPrismaRole(user.role),
        })),
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
