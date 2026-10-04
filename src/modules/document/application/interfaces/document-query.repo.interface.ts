import { Result } from 'neverthrow';
import {
  DocumentTrashResponseDto,
  DocumentDetailResponseDto,
  DocumentListResponseDto,
} from '../dtos/document.response.dto';
import {
  PageResult,
  PaginationRequest,
} from './../../../../shared/common/pagination';

export abstract class IDocumentQueryRepository {
  abstract getDocumentTrash(
    knowledgeSpaceId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentTrashResponseDto>, Error>>;
  abstract validateCachedDocumentList(
    knowledgeSpaceId: number,
    userId: number,
    pagination: PaginationRequest,
    page: PageResult<DocumentListResponseDto>,
  ): Promise<Result<boolean, Error>>;

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
