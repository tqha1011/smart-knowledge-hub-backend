import { Result } from 'neverthrow';
import { ChatMessage } from '../entities/chat-message.entity';

export type ChatMessagePersisted = {
  id: number;
};

export abstract class IChatMessageRepository {
  abstract addMessage(
    newMessage: ChatMessage,
  ): Promise<Result<ChatMessagePersisted, Error>>;
}
