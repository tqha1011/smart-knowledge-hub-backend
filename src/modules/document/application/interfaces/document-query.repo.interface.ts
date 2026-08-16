import { Result } from 'neverthrow';
import {
  DocumentDetailResponseDto,
  DocumentListResponseDto,
} from '../dtos/document.response.dto';
import {
  PageResult,
  PaginationRequest,
} from './../../../../shared/common/pagination';

export abstract class IDocumentQueryRepository {
  abstract getDocumentListInKnowledgeSpace(
    knowledgeSpaceId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentListResponseDto>, Error>>;

  abstract getDocumentDetail(
    knowledgeSpaceId: number,
    documentPublicId: string,
  ): Promise<Result<DocumentDetailResponseDto | null, Error>>;
}
