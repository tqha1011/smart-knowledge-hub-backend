import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { UnansweredQuestionListData } from '../dtos/unanswered-question.response.dto';

export abstract class IUnansweredQuestionService {
  abstract getUnansweredQuestionsAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<UnansweredQuestionListData>, AppError>>;

  abstract resolveUnansweredQuestionAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    questionPublicId: string,
  ): Promise<Result<undefined, AppError>>;
}
