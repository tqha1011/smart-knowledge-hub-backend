import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { DocumentPermissionRequestDto } from '../dtos/document.request.dto';

export abstract class IDocumentPermissionService {
  abstract addDocumentPermissionAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentPublicId: string,
    permissionRequest: DocumentPermissionRequestDto[],
  ): Promise<Result<undefined, AppError>>;

  abstract updateDocumentPermissionAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentPublicId: string,
    permissionRequest: DocumentPermissionRequestDto[],
  ): Promise<Result<undefined, AppError>>;
}
