import { Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { authorizeMembership } from 'src/modules/knowledge-space/application/services/authorizeMembership';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { IUnansweredQuestionQueryRepository } from '../interfaces/unanswered-question.query.repo.interface';
import { IUnansweredQuestionService } from '../interfaces/unanswered-question.service.interface';
import { UnansweredQuestionListData } from '../dtos/unanswered-question.response.dto';
import { IUnansweredQuestionRepository } from '../../domain/repositories/unanswered-question.repo.interface';

@Injectable()
export class UnansweredQuestionService implements IUnansweredQuestionService {
  constructor(
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
    private readonly unansweredQuestionRepository: IUnansweredQuestionRepository,
    private readonly unansweredQuestionQueryRepository: IUnansweredQuestionQueryRepository,
  ) {}

  async getUnansweredQuestionsAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<UnansweredQuestionListData>, AppError>> {
    const membership = authorizeMembership(
      await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
        userPublicId,
        knowledgeSpacePublicId,
      ),
      KnowledgeSpaceRole.Viewer,
      'view unanswered questions',
    );
    if (membership.isErr()) {
      return err(membership.error);
    }

    const listResult =
      await this.unansweredQuestionQueryRepository.getUnansweredQuestions(
        membership.value.knowledgeSpaceId,
        pagination,
      );
    if (listResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to get unanswered questions.',
        ),
      );
    }

    return ok(listResult.value);
  }

  async resolveUnansweredQuestionAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    questionPublicId: string,
  ): Promise<Result<undefined, AppError>> {
    const membership = authorizeMembership(
      await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
        userPublicId,
        knowledgeSpacePublicId,
      ),
      KnowledgeSpaceRole.Editor,
      'resolve unanswered questions',
    );
    if (membership.isErr()) {
      return err(membership.error);
    }

    const resolveResult =
      await this.unansweredQuestionRepository.markResolveQuestion(
        membership.value.knowledgeSpaceId,
        questionPublicId,
      );
    if (resolveResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to resolve the question.',
        ),
      );
    }
    if (!resolveResult.value) {
      return err(
        new AppError(
          ErrorCode.NotFound,
          'Unanswered question not found or already resolved.',
        ),
      );
    }

    return ok(undefined);
  }
}
