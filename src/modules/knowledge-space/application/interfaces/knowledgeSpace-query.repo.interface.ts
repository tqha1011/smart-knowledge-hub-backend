import { Result } from 'neverthrow';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import {
  GetUserKnowledgeSpace,
  UserSpaceData,
} from '../dtos/knowledgeSpace.response.dto';

export abstract class IKnowledgeSpaceQueryRepository {
  abstract getKnowledgeSpacesForUser(
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<GetUserKnowledgeSpace>, Error>>;

  abstract getUserDataInKnowledgeSpace(
    knowledgeSpaceId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<UserSpaceData>, Error>>;
}
