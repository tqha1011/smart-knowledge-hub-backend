import { Result } from 'neverthrow';
import { DocumentListResponseDto } from '../dtos/document.response.dto';
import {
  PageResult,
  PaginationRequest,
} from './../../../../shared/common/pagination';

export abstract class IDocumentQueryRepository {
  abstract getDocumentListInKnowledgeSpace(
    knowledgeSpaceId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentListResponseDto>, Error>>;
}
