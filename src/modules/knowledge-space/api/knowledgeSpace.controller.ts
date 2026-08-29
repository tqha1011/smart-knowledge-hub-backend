import {
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { toHttpException } from 'src/shared/common/app-error.mapper';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { JwtAuthGuard } from 'src/shared/common/jwt.guard';
import type { JwtPayload } from 'src/shared/common/jwt.payload.interface';
import { Roles } from 'src/shared/common/roles.decorator';
import { RolesGuard } from 'src/shared/common/roles.guard';
import { User } from 'src/shared/common/user.decorator';
import { SystemRole } from 'src/shared/domain/enum';
import { CreateKnowledgeSpaceDto } from '../application/dtos/knowledgeSpace.request.dto';
import { IKnowledgeSpaceService } from '../application/interfaces/knowledgeSpace.service.interface';

@ApiTags('knowledge-spaces')
@ApiBearerAuth()
@Controller('api/knowledge-spaces')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KnowledgeSpaceController {
  private readonly logger = new Logger(KnowledgeSpaceController.name);
  constructor(private readonly knowledgeSpaceService: IKnowledgeSpaceService) {}

  /**
   * Creates a knowledge space owned by the authenticated user.
   * @remarks The caller is registered as the Owner of the new space.
   * @throws {400} when the name, description or type is invalid.
   * @throws {401} when no valid bearer token is provided.
   * @throws {404} when the authenticated user no longer exists.
   * @throws {500} for any unexpected error while creating the knowledge space.
   * @example
   * POST /api/knowledge-spaces
   * {
   *   "name": "Engineering handbook",
   *   "description": "Everything a new engineer needs",
   *   "type": "HANDBOOK"
   * }
   */
  @ApiOperation({ summary: 'Create a new knowledge space' })
  @Roles([SystemRole.Admin])
  @Post()
  async createKnowledgeSpace(
    @User() user: JwtPayload,
    @Body() createKnowledgeSpaceDto: CreateKnowledgeSpaceDto,
  ) {
    const result = await this.knowledgeSpaceService.createKnowledgeSpace(
      user.sub,
      createKnowledgeSpaceDto,
    );
    return result.match(
      () => {
        return { message: 'Knowledge space created successfully' };
      },
      (error: AppError) => {
        throw this.toHttpError(error, 'creating a knowledge space');
      },
    );
  }

  /**
   * Returns the role the authenticated user holds in the given knowledge space.
   * @remarks `role` is `null` when the user is not a member of the space.
   * @throws {401} when no valid bearer token is provided.
   * @throws {404} when the user or the knowledge space does not exist.
   * @throws {500} for any unexpected error while reading the role.
   * @example
   * GET /api/knowledge-spaces/6b1f.../role
   * // { "role": "Owner" }
   */
  @ApiOperation({
    summary: 'Get the role of the current user in a knowledge space',
  })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Get(':knowledgeSpacePublicId/role')
  async getUserKnowledgeSpaceRole(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
  ) {
    const result = await this.knowledgeSpaceService.getUserKnowledgeSpaceRole(
      user.sub,
      knowledgeSpacePublicId,
    );
    return result.match(
      (role) => {
        return { role };
      },
      (error: AppError) => {
        throw this.toHttpError(error, 'reading a knowledge space role');
      },
    );
  }

  /**
   * Replaces the name, description and type of a knowledge space.
   * @remarks Only the Owner of the space may update it. Every field of the body
   * is written, so omitting `description` clears it.
   * @throws {400} when the name, description or type is invalid.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not the Owner of the knowledge space.
   * @throws {404} when the user or the knowledge space does not exist.
   * @throws {500} for any unexpected error while updating the knowledge space.
   * @example
   * PUT /api/knowledge-spaces/6b1f...
   * {
   *   "name": "Engineering handbook",
   *   "description": "Everything a new engineer needs",
   *   "type": "HANDBOOK"
   * }
   */
  @ApiOperation({ summary: 'Update a knowledge space' })
  @Roles([SystemRole.Admin])
  @Put(':knowledgeSpacePublicId')
  async updateKnowledgeSpace(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Body() updateKnowledgeSpaceDto: CreateKnowledgeSpaceDto,
  ) {
    const result = await this.knowledgeSpaceService.updateKnowledgeSpace(
      user.sub,
      knowledgeSpacePublicId,
      updateKnowledgeSpaceDto,
    );
    return result.match(
      () => {
        return { message: 'Knowledge space updated successfully' };
      },
      (error: AppError) => {
        throw this.toHttpError(error, 'updating a knowledge space');
      },
    );
  }

  /**
   * Maps an `AppError` to its HTTP exception, logging the ones that indicate a
   * failure on our side rather than a bad request.
   */
  private toHttpError(error: AppError, action: string): HttpException {
    if (error.code === ErrorCode.InternalServerError) {
      this.logger.error(`Unexpected error while ${action}:`, error.stack);
    }
    return toHttpException(error);
  }
}
