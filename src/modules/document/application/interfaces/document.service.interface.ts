import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import {
  DocumentCreateRequestDto,
  DocumentUploadUrlRequestDto,
} from '../dtos/document.request.dto';
import {
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

  abstract createDocumentAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentCreateRequestDto: DocumentCreateRequestDto,
  ): Promise<Result<DocumentListResponseDto, AppError>>;
}
