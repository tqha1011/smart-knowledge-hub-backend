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
  abstract searchDocumentsInKnowledgeSpace(
    knowledgeSpaceId: number,
    userId: number,
    documentName: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentListResponseDto>, Error>>;

  abstract getDocumentListInKnowledgeSpace(
    knowledgeSpaceId: number,
    userId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentListResponseDto>, Error>>;

  abstract getDocumentDetail(
    knowledgeSpaceId: number,
    documentPublicId: string,
  ): Promise<Result<DocumentDetailResponseDto | null, Error>>;

  abstract getDocumentListItemByPublicId(
    knowledgeSpaceId: number,
    documentPublicId: string,
  ): Promise<Result<DocumentListResponseDto | null, Error>>;
}
