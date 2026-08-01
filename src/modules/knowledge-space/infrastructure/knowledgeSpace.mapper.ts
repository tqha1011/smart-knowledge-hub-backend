import {
  KnowledgeSpaceType as PrismaKnowledgeSpaceType,
  WorkSpaceRole,
} from 'generated/prisma/enums';
import { KnowledgeSpaceRole, KnowledgeSpaceType } from 'src/shared/domain/enum';

/**
 * Lookup tables between the shared domain enums and the Prisma enums.
 * Typing them as `Record<Source, Target>` makes a missing entry a compile
 * error, so adding a value to either enum cannot silently go unmapped.
 */
const typeToPrisma: Record<KnowledgeSpaceType, PrismaKnowledgeSpaceType> = {
  [KnowledgeSpaceType.DEPARTMENT]: PrismaKnowledgeSpaceType.DEPARTMENT,
  [KnowledgeSpaceType.POLICY]: PrismaKnowledgeSpaceType.POLICY,
  [KnowledgeSpaceType.HANDBOOK]: PrismaKnowledgeSpaceType.HANDBOOK,
  [KnowledgeSpaceType.ONBOARDING]: PrismaKnowledgeSpaceType.ONBOARDING,
  [KnowledgeSpaceType.SUPPORT]: PrismaKnowledgeSpaceType.SUPPORT,
  [KnowledgeSpaceType.GUIDELINE]: PrismaKnowledgeSpaceType.GUIDELINE,
  [KnowledgeSpaceType.GENERAL]: PrismaKnowledgeSpaceType.GENERAL,
};

const typeToDomain: Record<PrismaKnowledgeSpaceType, KnowledgeSpaceType> = {
  [PrismaKnowledgeSpaceType.DEPARTMENT]: KnowledgeSpaceType.DEPARTMENT,
  [PrismaKnowledgeSpaceType.POLICY]: KnowledgeSpaceType.POLICY,
  [PrismaKnowledgeSpaceType.HANDBOOK]: KnowledgeSpaceType.HANDBOOK,
  [PrismaKnowledgeSpaceType.ONBOARDING]: KnowledgeSpaceType.ONBOARDING,
  [PrismaKnowledgeSpaceType.SUPPORT]: KnowledgeSpaceType.SUPPORT,
  [PrismaKnowledgeSpaceType.GUIDELINE]: KnowledgeSpaceType.GUIDELINE,
  [PrismaKnowledgeSpaceType.GENERAL]: KnowledgeSpaceType.GENERAL,
};

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

export function toPrismaType(
  type: KnowledgeSpaceType,
): PrismaKnowledgeSpaceType {
  return typeToPrisma[type];
}

export function toDomainType(
  type: PrismaKnowledgeSpaceType,
): KnowledgeSpaceType {
  return typeToDomain[type];
}

export function toPrismaRole(role: KnowledgeSpaceRole): WorkSpaceRole {
  return roleToPrisma[role];
}

export function toDomainRole(role: WorkSpaceRole): KnowledgeSpaceRole {
  return roleToDomain[role];
}
