import { ChatRole } from 'generated/prisma/enums';
import { CommonChatRole } from 'src/shared/domain/enum';

const roleToPrisma: Record<CommonChatRole, ChatRole> = {
  [CommonChatRole.User]: ChatRole.User,
  [CommonChatRole.Assistant]: ChatRole.Assistant,
};

const roleToDomain: Record<ChatRole, CommonChatRole> = {
  [ChatRole.User]: CommonChatRole.User,
  [ChatRole.Assistant]: CommonChatRole.Assistant,
};

export function toPrismaRole(role: CommonChatRole): ChatRole {
  return roleToPrisma[role];
}

export function toDomainRole(role: ChatRole): CommonChatRole {
  return roleToDomain[role];
}
