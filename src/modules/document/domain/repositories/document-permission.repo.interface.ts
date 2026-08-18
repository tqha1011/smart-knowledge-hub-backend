import { Result } from 'neverthrow';
import { CommonPermissionType } from 'src/shared/domain/enum';

export abstract class IDocumentPermissionRepository {
  abstract checkDocumentPermission(
    documentId: number,
    userId: number,
  ): Promise<Result<CommonPermissionType, Error>>;
}
