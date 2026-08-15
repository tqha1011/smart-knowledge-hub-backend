import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { DocumentListResponseDto } from '../dtos/document.response.dto';
import { PageResult } from './../../../../shared/common/pagination';

export abstract class IDocumentQueryRepository {
  abstract getDocumentListInKnowledgeSpace(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<PageResult<DocumentListResponseDto>, AppError>>;
}
