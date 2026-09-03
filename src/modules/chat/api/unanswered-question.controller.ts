import {
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { ResolveUnansweredQuestionRequestDto } from '../application/dtos/unanswered-question.request.dto';
import { IUnansweredQuestionService } from '../application/interfaces/unanswered-question.service.interface';

@ApiTags('unanswered-questions')
@ApiBearerAuth()
@Controller('api/knowledge-spaces/:knowledgeSpacePublicId/unanswered-questions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UnansweredQuestionController {
  private readonly logger = new Logger(UnansweredQuestionController.name);
  constructor(
    private readonly unansweredQuestionService: IUnansweredQuestionService,
  ) {}

  /**
   * Lists unresolved questions the assistant could not answer in this
   * knowledge space, newest first.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not a member of the knowledge space.
   * @throws {500} for any unexpected error while fetching the list.
   * @example
   * GET /api/knowledge-spaces/6b1f.../unanswered-questions?pageNumber=1&pageSize=20
   */
  @ApiOperation({ summary: 'List unresolved questions for a knowledge space' })
  @ApiOkResponse({
    description: 'Paginated list of unresolved questions',
    schema: {
      example: {
        items: [
          {
            publicId: 'a1b2c3d4-e5f6-4789-9abc-def012345678',
            question: 'What is the parental leave policy?',
            reason: 'No document in this knowledge space covers this topic',
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
  async getUnansweredQuestions(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Query(new ValidationPipe({ transform: true }))
    pagination: PaginationQueryDto,
  ) {
    const result =
      await this.unansweredQuestionService.getUnansweredQuestionsAsync(
        knowledgeSpacePublicId,
        user.sub,
        pagination,
      );
    return result.match(
      (page) => page,
      (error: AppError) => {
        throw this.toHttpError(error, 'listing unanswered questions');
      },
    );
  }

  /**
   * Marks an unanswered question as resolved.
   * @remarks The answer is folded into the knowledge space's FAQ document
   * (created on first use), which is then re-ingested so future questions can
   * be answered from it.
   * @throws {400} when `answer` is missing or too long.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not at least an Editor of the knowledge space.
   * @throws {404} when the question does not exist, belongs to another
   * knowledge space, or was already resolved.
   * @throws {500} for any unexpected error while resolving the question.
   * @example
   * PATCH /api/knowledge-spaces/6b1f.../unanswered-questions/8d4c.../resolve
   * { "answer": "Parental leave is 6 months, see the HR policies handbook." }
   */
  @ApiOperation({ summary: 'Mark an unanswered question as resolved' })
  @ApiOkResponse({
    description: 'Question resolved successfully',
    schema: { example: { resolved: true } },
  })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Patch(':questionPublicId/resolve')
  async resolveUnansweredQuestion(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Param('questionPublicId', ParseUUIDPipe) questionPublicId: string,
    @Body()
    resolveUnansweredQuestionRequestDto: ResolveUnansweredQuestionRequestDto,
  ) {
    const result =
      await this.unansweredQuestionService.resolveUnansweredQuestionAsync(
        knowledgeSpacePublicId,
        user.sub,
        questionPublicId,
        resolveUnansweredQuestionRequestDto.answer,
      );
    return result.match(
      () => ({ resolved: true }),
      (error: AppError) => {
        throw this.toHttpError(error, 'resolving an unanswered question');
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
