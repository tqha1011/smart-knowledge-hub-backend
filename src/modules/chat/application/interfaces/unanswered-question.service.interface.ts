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

  /**
   * Marks the question resolved and folds the answer into the knowledge
   * space's FAQ document (created on first use), which is then re-ingested.
   */
  abstract resolveUnansweredQuestionAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    questionPublicId: string,
    answer: string,
  ): Promise<Result<undefined, AppError>>;
}
