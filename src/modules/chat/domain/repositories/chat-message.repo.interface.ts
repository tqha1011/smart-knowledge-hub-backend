import { Result } from 'neverthrow';
import { ChatMessage } from '../entities/chat-message.entity';

export abstract class IChatMessageRepository {
  abstract addMessage(
    newMessage: ChatMessage,
  ): Promise<Result<undefined, Error>>;
}
