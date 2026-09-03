import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { err, ok, Result } from 'neverthrow';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { AddMembersRequest } from '../../domain/repositories/knowledgeSpaceMember.repo.interface';
import { IKnowledgeSpaceRepository } from '../../domain/repositories/knowledgeSpace.repo.interface';
import { IKnowledgeSpaceMemberRepository } from '../../domain/repositories/knowledgeSpaceMember.repo.interface';
import { AddMemberRequestDto } from '../dtos/knowledgeSpace.request.dto';
import { IKnowledgeSpaceMemberService } from '../interfaces/knowledgeSpaceMember.service.interface';
import { authorizeMembership } from './authorizeMembership';

@Injectable()
export class KnowledgeSpaceMemberService implements IKnowledgeSpaceMemberService {
  private readonly logger = new Logger(KnowledgeSpaceMemberService.name);
  constructor(
    private readonly knowledgeSpaceMemberRepository: IKnowledgeSpaceMemberRepository,
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
    private readonly userRepository: IUserRepository,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async addMembersAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    members: AddMemberRequestDto[],
  ): Promise<Result<undefined, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Owner,
        'add members',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const userPublicIds = members.map((m) => m.userPublicId);
      const resolveResult = await this.resolveUserIds(userPublicIds);
      if (resolveResult.isErr()) {
        return err(resolveResult.error);
      }
      const userIdByPublicId = resolveResult.value;

      const addMembersRequest: AddMembersRequest[] = members.map((m) => ({
        // Safe: resolveUserIds already confirmed every userPublicId is present.
        userId: userIdByPublicId.get(m.userPublicId)!,
        role: m.role,
      }));

      const addResult = await this.knowledgeSpaceMemberRepository.addMembers(
        addMembersRequest,
        membership.value.knowledgeSpaceId,
      );
      if (addResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to add members. ${addResult.error.message}`,
          ),
        );
      }

      // Best-effort: members are already added successfully, so a failure to
      // notify them by email must not fail the request.
      await this.notifyMembersAdded(
        userPublicId,
        membership.value.knowledgeSpaceId,
        members,
        userIdByPublicId,
      );

      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to add members', error);
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to add members'),
      );
    }
  }

  private async notifyMembersAdded(
    inviterPublicId: string,
    knowledgeSpaceId: number,
    members: AddMemberRequestDto[],
    userIdByPublicId: Map<string, number>,
  ): Promise<void> {
    try {
      const [inviterResult, spaceNameResult, contactsResult] =
        await Promise.all([
          this.userRepository.GetUserDataByPublicId(inviterPublicId),
          this.knowledgeSpaceRepository.getKnowledgeSpaceNameById(
            knowledgeSpaceId,
          ),
          this.userRepository.GetUsersContactDataByIds([
            ...userIdByPublicId.values(),
          ]),
        ]);
      if (
        inviterResult.isErr() ||
        spaceNameResult.isErr() ||
        contactsResult.isErr()
      ) {
        throw new Error('Failed to resolve data needed for the email');
      }

      const roleByUserId = new Map(
        members.map((m) => [userIdByPublicId.get(m.userPublicId), m.role]),
      );
      const loginUrl = this.configService.get<string>('FRONTEND_URL');
      const knowledgeSpaceName = spaceNameResult.value ?? 'a knowledge space';
      const invitedBy = inviterResult.value?.name;

      await Promise.all(
        contactsResult.value.map((contact) =>
          this.mailerService.sendMail({
            to: contact.email,
            subject: `You've been added to ${knowledgeSpaceName}`,
            template: 'member-added',
            context: {
              memberName: contact.username,
              role: roleByUserId.get(contact.id),
              knowledgeSpaceName,
              invitedBy,
              loginUrl,
            },
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        'Failed to send member-added notification emails',
        error,
      );
    }
  }

  async kickMembersAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    targetUserPublicIds: string[],
  ): Promise<Result<undefined, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Owner,
        'kick members',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const resolveResult = await this.resolveUserIds(targetUserPublicIds);
      if (resolveResult.isErr()) {
        return err(resolveResult.error);
      }
      const targetUserIds = [...resolveResult.value.values()];

      const guardResult = await this.guardLastOwner(
        membership.value.knowledgeSpaceId,
        targetUserIds,
      );
      if (guardResult.isErr()) {
        return err(guardResult.error);
      }

      const kickResult = await this.knowledgeSpaceMemberRepository.kickMembers(
        targetUserIds,
        membership.value.knowledgeSpaceId,
      );
      if (kickResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to kick members. ${kickResult.error.message}`,
          ),
        );
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to kick members', error);
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to kick members'),
      );
    }
  }

  async leaveKnowledgeSpaceAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<undefined, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Viewer,
        'leave knowledge space',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const guardResult = await this.guardLastOwner(
        membership.value.knowledgeSpaceId,
        [membership.value.userId],
      );
      if (guardResult.isErr()) {
        return err(guardResult.error);
      }

      const leaveResult =
        await this.knowledgeSpaceMemberRepository.leaveKnowledgeSpace(
          membership.value.userId,
          membership.value.knowledgeSpaceId,
        );
      if (leaveResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to leave knowledge space. ${leaveResult.error.message}`,
          ),
        );
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to leave knowledge space', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to leave knowledge space',
        ),
      );
    }
  }

  async updateMemberRoleAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    targetUserPublicId: string,
    role: KnowledgeSpaceRole,
  ): Promise<Result<undefined, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Owner,
        'update member role',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const resolveResult = await this.resolveUserIds([targetUserPublicId]);
      if (resolveResult.isErr()) {
        return err(resolveResult.error);
      }
      // Safe: resolveUserIds already confirmed targetUserPublicId is present.
      const targetUserId = resolveResult.value.get(targetUserPublicId)!;

      const currentRoleResult =
        await this.knowledgeSpaceRepository.getUserKnowledgeSpaceRole(
          targetUserId,
          membership.value.knowledgeSpaceId,
        );
      if (currentRoleResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to resolve member role. ${currentRoleResult.error.message}`,
          ),
        );
      }
      if (currentRoleResult.value === null) {
        return err(
          new AppError(
            ErrorCode.NotFound,
            `User ${targetUserPublicId} is not a member of this knowledge space`,
          ),
        );
      }

      // Owner count can only decrease when the target stops being an Owner.
      if (role !== KnowledgeSpaceRole.Owner) {
        const guardResult = await this.guardLastOwner(
          membership.value.knowledgeSpaceId,
          [targetUserId],
        );
        if (guardResult.isErr()) {
          return err(guardResult.error);
        }
      }

      const updateResult =
        await this.knowledgeSpaceMemberRepository.updateMemberRole(
          targetUserId,
          membership.value.knowledgeSpaceId,
          role,
        );
      if (updateResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to update member role. ${updateResult.error.message}`,
          ),
        );
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to update member role', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to update member role',
        ),
      );
    }
  }

  /**
   * Resolves public ids to internal ids, matched by publicId (not index) since a
   * missing publicId is simply absent from the repository result.
   */
  private async resolveUserIds(
    userPublicIds: string[],
  ): Promise<Result<Map<string, number>, AppError>> {
    const userIdsResult =
      await this.userRepository.GetUserIdsByPublicIds(userPublicIds);
    if (userIdsResult.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to get user IDs'),
      );
    }
    const userIdByPublicId = new Map(
      userIdsResult.value.map((user) => [user.publicId, user.id]),
    );
    const missingPublicIds = userPublicIds.filter(
      (publicId) => !userIdByPublicId.has(publicId),
    );
    if (missingPublicIds.length > 0) {
      return err(
        new AppError(
          ErrorCode.NotFound,
          `User(s) not found: ${missingPublicIds.join(', ')}`,
        ),
      );
    }
    return ok(userIdByPublicId);
  }

  /**
   * Blocks removing every Owner from a knowledge space: counts how many of the
   * target userIds currently hold the Owner role, and rejects if removing them
   * would leave none.
   */
  private async guardLastOwner(
    knowledgeSpaceId: number,
    targetUserIds: number[],
  ): Promise<Result<undefined, AppError>> {
    const roleResults = await Promise.all(
      targetUserIds.map((userId) =>
        this.knowledgeSpaceRepository.getUserKnowledgeSpaceRole(
          userId,
          knowledgeSpaceId,
        ),
      ),
    );
    const failedRoleResult = roleResults.find((result) => result.isErr());
    if (failedRoleResult && failedRoleResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to resolve member roles. ${failedRoleResult.error.message}`,
        ),
      );
    }

    const ownersBeingRemoved = roleResults.filter(
      (result) => result.isOk() && result.value === KnowledgeSpaceRole.Owner,
    ).length;
    if (ownersBeingRemoved === 0) {
      return ok(undefined);
    }

    const ownerCountResult =
      await this.knowledgeSpaceMemberRepository.countOwners(knowledgeSpaceId);
    if (ownerCountResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to count owners. ${ownerCountResult.error.message}`,
        ),
      );
    }
    if (ownerCountResult.value - ownersBeingRemoved < 1) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'Cannot remove the last owner of the knowledge space',
        ),
      );
    }
    return ok(undefined);
  }
}
