import { Result } from 'neverthrow';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { GetUserKnowledgeSpace } from '../dtos/knowledgeSpace.response.dto';

export abstract class IKnowledgeSpaceQueryRepository {
  abstract getKnowledgeSpacesForUser(
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<GetUserKnowledgeSpace>, Error>>;
}
