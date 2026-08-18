import { PermissionType } from 'generated/prisma/enums';
import { CommonPermissionType } from 'src/shared/domain/enum';

const permissionToPrisma: Record<CommonPermissionType, PermissionType> = {
  [CommonPermissionType.Read]: PermissionType.Read,
  [CommonPermissionType.Edit]: PermissionType.Edit,
  [CommonPermissionType.Manage]: PermissionType.Manage,
};

const permissionToDomain: Record<PermissionType, CommonPermissionType> = {
  [PermissionType.Read]: CommonPermissionType.Read,
  [PermissionType.Edit]: CommonPermissionType.Edit,
  [PermissionType.Manage]: CommonPermissionType.Manage,
};

export function toPrismaPermission(
  permission: CommonPermissionType,
): PermissionType {
  return permissionToPrisma[permission];
}

export function toDomainPermission(
  permission: PermissionType,
): CommonPermissionType {
  return permissionToDomain[permission];
}
