import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { DocumentCreateRequestDto } from '../dtos/document.request.dto';
import { DocumentListResponseDto } from '../dtos/document.response.dto';

export abstract class IDocumentService {
  abstract createDocumentAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentCreateRequestDto: DocumentCreateRequestDto,
  ): Promise<Result<DocumentListResponseDto, AppError>>;
}
