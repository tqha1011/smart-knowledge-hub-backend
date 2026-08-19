import { Result } from 'neverthrow';
import { CommonPermissionType } from 'src/shared/domain/enum';

export type DocumentPermissionRequest = {
  userId: number;
  documentId: number;
  permission: CommonPermissionType;
};
export abstract class IDocumentPermissionRepository {
  abstract checkDocumentPermission(
    documentId: number,
    userId: number,
  ): Promise<Result<CommonPermissionType | null, Error>>;

  abstract addDocumentPermission(
    permissionRequest: DocumentPermissionRequest[],
  ): Promise<Result<undefined, Error>>;
}
