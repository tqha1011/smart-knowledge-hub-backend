import { WorkSpaceRole } from 'generated/prisma/enums';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';

/**
 * Lookup tables between the shared domain enums and the Prisma enums.
 * Typing them as `Record<Source, Target>` makes a missing entry a compile
 * error, so adding a value to either enum cannot silently go unmapped.
 */
const roleToPrisma: Record<KnowledgeSpaceRole, WorkSpaceRole> = {
  [KnowledgeSpaceRole.Owner]: WorkSpaceRole.Owner,
  [KnowledgeSpaceRole.Editor]: WorkSpaceRole.Editor,
  [KnowledgeSpaceRole.Viewer]: WorkSpaceRole.Viewer,
};

const roleToDomain: Record<WorkSpaceRole, KnowledgeSpaceRole> = {
  [WorkSpaceRole.Owner]: KnowledgeSpaceRole.Owner,
  [WorkSpaceRole.Editor]: KnowledgeSpaceRole.Editor,
  [WorkSpaceRole.Viewer]: KnowledgeSpaceRole.Viewer,
};

export function toPrismaRole(role: KnowledgeSpaceRole): WorkSpaceRole {
  return roleToPrisma[role];
}

export function toDomainRole(role: WorkSpaceRole): KnowledgeSpaceRole {
  return roleToDomain[role];
}
