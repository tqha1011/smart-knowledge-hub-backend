import { KnowledgeSpaceRole } from './enum';

const ROLE_RANK: Record<KnowledgeSpaceRole, number> = {
  [KnowledgeSpaceRole.Owner]: 3,
  [KnowledgeSpaceRole.Editor]: 2,
  [KnowledgeSpaceRole.Viewer]: 1,
};

export function hasAtLeastRole(
  userRole: KnowledgeSpaceRole,
  requiredRole: KnowledgeSpaceRole,
): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];
}

export function isReadOnlyRole(userRole: KnowledgeSpaceRole): boolean {
  return !hasAtLeastRole(userRole, KnowledgeSpaceRole.Editor);
}
