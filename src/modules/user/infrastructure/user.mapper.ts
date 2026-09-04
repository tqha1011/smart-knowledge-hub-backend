import { Role } from 'generated/prisma/enums';
import { SystemRole } from 'src/shared/domain/enum';

export const roleToDomain: Record<Role, SystemRole> = {
  [Role.Employee]: SystemRole.Employee,
  [Role.Admin]: SystemRole.Admin,
};

export const roleToPrisma: Record<SystemRole, Role> = {
  [SystemRole.Employee]: Role.Employee,
  [SystemRole.Admin]: Role.Admin,
};

export function mapRoleToPrisma(role: SystemRole): Role {
  return roleToPrisma[role];
}

export function mapRoleToDomain(role: Role): SystemRole {
  return roleToDomain[role];
}
