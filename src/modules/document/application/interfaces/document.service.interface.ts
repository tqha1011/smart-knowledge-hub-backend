import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import {
  DocumentCreateRequestDto,
  DocumentUpdateRequestDto,
  DocumentUploadUrlRequestDto,
} from '../dtos/document.request.dto';
import {
  DocumentDetailResponseDto,
  DocumentListResponseDto,
  DocumentUploadUrlResponseDto,
} from '../dtos/document.response.dto';

export abstract class IDocumentService {
  /**
   * Hands the client a short-lived URL to PUT the file straight to storage, so the
   * bytes never travel through this API. The returned key must come back with
   * {@link createDocumentAsync}.
   */
  abstract getUploadUrlAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentUploadUrlRequestDto: DocumentUploadUrlRequestDto,
  ): Promise<Result<DocumentUploadUrlResponseDto, AppError>>;

  /** Short-lived read URL for the stored file; the browser opens it directly. */
  abstract getDownloadUrlAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentPublicId: string,
  ): Promise<Result<string, AppError>>;

  abstract createDocumentAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentCreateRequestDto: DocumentCreateRequestDto,
  ): Promise<Result<DocumentListResponseDto, AppError>>;

  abstract getDocumentListAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentListResponseDto>, AppError>>;

  /** A `Restricted` document additionally requires a `DocumentPermission` row for the caller. */
  abstract getDocumentDetailAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentPublicId: string,
  ): Promise<Result<DocumentDetailResponseDto, AppError>>;

  /**
   * Partial update of a document's metadata. Providing `content` marks the document
   * `Processing` again and re-enqueues it for ingestion. Permission grants are handled
   * separately by the document-permission endpoints, not through this method.
   */
  abstract updateDocumentAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentPublicId: string,
    documentUpdateRequestDto: DocumentUpdateRequestDto,
  ): Promise<Result<DocumentListResponseDto, AppError>>;
}
