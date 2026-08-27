import { CommonChatRole } from 'src/shared/domain/enum';

export abstract class ChatMessageRepository {
  abstract addMessage(
    chatSessionId: number,
    role: CommonChatRole,
    content: string,
  ): Promise<void>;
}
