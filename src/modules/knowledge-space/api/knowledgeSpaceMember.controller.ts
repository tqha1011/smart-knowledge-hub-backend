import {
  Body,
  Controller,
  Delete,
  HttpException,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { toHttpException } from 'src/shared/common/app-error.mapper';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { JwtAuthGuard } from 'src/shared/common/jwt.guard';
import type { JwtPayload } from 'src/shared/common/jwt.payload.interface';
import { Roles } from 'src/shared/common/roles.decorator';
import { RolesGuard } from 'src/shared/common/roles.guard';
import { User } from 'src/shared/common/user.decorator';
import { SystemRole } from 'src/shared/domain/enum';
import {
  AddMembersRequestDto,
  KickMembersRequestDto,
} from '../application/dtos/knowledgeSpace.request.dto';
import { IKnowledgeSpaceMemberService } from '../application/interfaces/knowledgeSpaceMember.service.interface';

@ApiTags('knowledge-spaces')
@ApiBearerAuth()
@Controller('api/knowledge-spaces/:knowledgeSpacePublicId/members')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KnowledgeSpaceMemberController {
  private readonly logger = new Logger(KnowledgeSpaceMemberController.name);
  constructor(
    private readonly knowledgeSpaceMemberService: IKnowledgeSpaceMemberService,
  ) {}

  /**
   * Adds one or more users as members of a knowledge space.
   * @remarks Only the Owner may add members. A `userPublicId` that is already a
   * member is skipped rather than failing the request.
   * @throws {400} when a `userPublicId` is not a valid UUID or `role` is invalid.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not the Owner of the knowledge space.
   * @throws {404} when the knowledge space does not exist, or a `userPublicId`
   * does not resolve to any user.
   * @throws {500} for any unexpected error while adding members.
   * @example
   * POST /api/knowledge-spaces/6b1f.../members
   * { "members": [{ "userPublicId": "0f2a...", "role": "Editor" }] }
   */
  @ApiOperation({ summary: 'Add members to a knowledge space' })
  @ApiCreatedResponse({
    description: 'Members added successfully',
    schema: { example: { success: true } },
  })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Post()
  async addMembers(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Body() addMembersRequestDto: AddMembersRequestDto,
  ) {
    const result = await this.knowledgeSpaceMemberService.addMembersAsync(
      user.sub,
      knowledgeSpacePublicId,
      addMembersRequestDto.members,
    );
    return result.match(
      () => ({ success: true }),
      (error: AppError) => {
        throw this.toHttpError(error, 'adding knowledge space members');
      },
    );
  }

  /**
   * Removes one or more members from a knowledge space.
   * @remarks Only the Owner may kick members. Rejected if doing so would leave
   * the knowledge space with no Owner.
   * @throws {400} when a `userPublicId` is not a valid UUID, or the kick would
   * remove the last Owner.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not the Owner of the knowledge space.
   * @throws {404} when the knowledge space does not exist, or a `userPublicId`
   * does not resolve to any user.
   * @throws {500} for any unexpected error while kicking members.
   * @example
   * DELETE /api/knowledge-spaces/6b1f.../members
   * { "userPublicIds": ["0f2a..."] }
   */
  @ApiOperation({ summary: 'Kick members from a knowledge space' })
  @ApiOkResponse({
    description: 'Members kicked successfully',
    schema: { example: { success: true } },
  })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Delete()
  async kickMembers(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Body() kickMembersRequestDto: KickMembersRequestDto,
  ) {
    const result = await this.knowledgeSpaceMemberService.kickMembersAsync(
      user.sub,
      knowledgeSpacePublicId,
      kickMembersRequestDto.userPublicIds,
    );
    return result.match(
      () => ({ success: true }),
      (error: AppError) => {
        throw this.toHttpError(error, 'kicking knowledge space members');
      },
    );
  }

  /**
   * Removes the authenticated user from a knowledge space.
   * @remarks Any member may leave. Rejected if the caller is the last Owner of
   * the knowledge space.
   * @throws {400} when the caller is the last Owner of the knowledge space.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not a member of the knowledge space.
   * @throws {404} when the knowledge space does not exist.
   * @throws {500} for any unexpected error while leaving the knowledge space.
   * @example
   * DELETE /api/knowledge-spaces/6b1f.../members/me
   */
  @ApiOperation({ summary: 'Leave a knowledge space' })
  @ApiOkResponse({
    description: 'Left the knowledge space successfully',
    schema: { example: { success: true } },
  })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Delete('me')
  async leaveKnowledgeSpace(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
  ) {
    const result =
      await this.knowledgeSpaceMemberService.leaveKnowledgeSpaceAsync(
        user.sub,
        knowledgeSpacePublicId,
      );
    return result.match(
      () => ({ success: true }),
      (error: AppError) => {
        throw this.toHttpError(error, 'leaving a knowledge space');
      },
    );
  }

  private toHttpError(error: AppError, action: string): HttpException {
    if (error.code === ErrorCode.InternalServerError) {
      this.logger.error(`Unexpected error while ${action}:`, error.stack);
    }
    return toHttpException(error);
  }
}
