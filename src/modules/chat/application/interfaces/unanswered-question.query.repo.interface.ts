import { Result } from 'neverthrow';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { UnansweredQuestionListData } from '../dtos/unanswered-question.response.dto';

export abstract class IUnansweredQuestionQueryRepository {
  abstract getUnansweredQuestions(
    knowledgeSpaceId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<UnansweredQuestionListData>, Error>>;
}
