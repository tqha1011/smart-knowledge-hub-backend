import {
  Controller,
  Delete,
  Get,
  HttpException,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
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
import { PaginationQueryDto } from 'src/shared/common/pagination';
import { Roles } from 'src/shared/common/roles.decorator';
import { RolesGuard } from 'src/shared/common/roles.guard';
import { User } from 'src/shared/common/user.decorator';
import { SystemRole } from 'src/shared/domain/enum';
import { IChatSessionService } from '../application/interfaces/chat-session.service.interface';

@ApiTags('chat-sessions')
@ApiBearerAuth()
@Controller('api/knowledge-spaces/:knowledgeSpacePublicId/chat-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatSessionController {
  private readonly logger = new Logger(ChatSessionController.name);
  constructor(private readonly chatSessionService: IChatSessionService) {}

  /**
   * Creates a new chat session in a knowledge space.
   * @remarks The session starts titled "New chat"; an AI-generated title
   * based on the first message is a planned follow-up, not implemented yet.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not a member of the knowledge space.
   * @throws {404} when the user or the knowledge space does not exist.
   * @throws {500} for any unexpected error while creating the session.
   * @example
   * POST /api/knowledge-spaces/6b1f.../chat-sessions
   */
  @ApiOperation({ summary: 'Create a chat session' })
  @ApiCreatedResponse({
    description: 'Chat session created successfully',
    schema: {
      example: {
        publicId: '8d4c2a1e-5b3f-4a6d-9e2c-1f7a3b5d9c0e',
        title: 'New chat',
      },
    },
  })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Post()
  async createSession(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
  ) {
    const result = await this.chatSessionService.createSessionAsync(
      user.sub,
      knowledgeSpacePublicId,
    );
    return result.match(
      (session) => session,
      (error: AppError) => {
        throw this.toHttpError(error, 'creating a chat session');
      },
    );
  }

  /**
   * Deletes (soft) a chat session owned by the caller.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not a member of the knowledge space.
   * @throws {404} when the session does not exist, belongs to another user,
   * or was already deleted.
   * @throws {500} for any unexpected error while deleting the session.
   * @example
   * DELETE /api/knowledge-spaces/6b1f.../chat-sessions/8d4c...
   */
  @ApiOperation({ summary: 'Delete a chat session' })
  @ApiOkResponse({
    description: 'Chat session deleted successfully',
    schema: { example: { success: true } },
  })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Delete(':sessionPublicId')
  async deleteSession(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
  ) {
    const result = await this.chatSessionService.deleteSessionAsync(
      user.sub,
      knowledgeSpacePublicId,
      sessionPublicId,
    );
    return result.match(
      () => ({ success: true }),
      (error: AppError) => {
        throw this.toHttpError(error, 'deleting a chat session');
      },
    );
  }

  /**
   * Lists the caller's own chat sessions in a knowledge space, most recently
   * updated first.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not a member of the knowledge space.
   * @throws {500} for any unexpected error while fetching the list.
   * @example
   * GET /api/knowledge-spaces/6b1f.../chat-sessions?pageNumber=1&pageSize=20
   */
  @ApiOperation({ summary: 'List the caller chat sessions' })
  @ApiOkResponse({
    description: 'Paginated list of the caller chat sessions',
    schema: {
      example: {
        items: [
          {
            publicId: '8d4c2a1e-5b3f-4a6d-9e2c-1f7a3b5d9c0e',
            title: 'New chat',
            updatedAt: '2026-08-30T10:00:00.000Z',
          },
        ],
        totalPages: 1,
        currentPage: 1,
        pageNumber: 1,
        pageSize: 20,
        hasPrevious: false,
        hasNext: false,
      },
    },
  })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Get()
  async getSessions(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Query(new ValidationPipe({ transform: true }))
    pagination: PaginationQueryDto,
  ) {
    const result = await this.chatSessionService.getSessionsForUserAsync(
      user.sub,
      knowledgeSpacePublicId,
      pagination,
    );
    return result.match(
      (page) => page,
      (error: AppError) => {
        throw this.toHttpError(error, 'listing chat sessions');
      },
    );
  }

  /**
   * Returns a chat session's detail with its message history, oldest first.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not a member of the knowledge space.
   * @throws {404} when the session does not exist or belongs to another user.
   * @throws {500} for any unexpected error while fetching the session.
   * @example
   * GET /api/knowledge-spaces/6b1f.../chat-sessions/8d4c...?pageNumber=1&pageSize=20
   */
  @ApiOperation({ summary: 'Get a chat session detail with its messages' })
  @ApiOkResponse({
    description: 'Chat session detail with paginated message history',
    schema: {
      example: {
        publicId: '8d4c2a1e-5b3f-4a6d-9e2c-1f7a3b5d9c0e',
        title: 'New chat',
        createdAt: '2026-08-30T10:00:00.000Z',
        messages: {
          items: [
            {
              publicId: 'a1b2c3d4-e5f6-4789-9abc-def012345678',
              role: 'User',
              content: 'How do I request PTO?',
              createdAt: '2026-08-30T10:00:05.000Z',
            },
          ],
          totalPages: 1,
          currentPage: 1,
          pageNumber: 1,
          pageSize: 20,
          hasPrevious: false,
          hasNext: false,
        },
      },
    },
  })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Get(':sessionPublicId')
  async getSessionDetail(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
    @Query(new ValidationPipe({ transform: true }))
    pagination: PaginationQueryDto,
  ) {
    const result = await this.chatSessionService.getSessionDetailAsync(
      user.sub,
      knowledgeSpacePublicId,
      sessionPublicId,
      pagination,
    );
    return result.match(
      (session) => session,
      (error: AppError) => {
        throw this.toHttpError(error, 'getting a chat session detail');
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
