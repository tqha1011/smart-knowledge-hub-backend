import { UUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { CommonChatRole } from 'src/shared/domain/enum';
import {
  ChatMessageDomainError,
  ChatMessageDomainErrorValidation,
} from '../errors/chat-message.domain.error';

export type ChatMessageGetParams = {
  readonly chatSessionId: number;
  readonly messagePublicId: UUID;
  readonly messageId: number;
  readonly content: string;
  readonly role: CommonChatRole;
  readonly createdAt: Date;
  updatedAt: Date;
};

export type ChatMessageCreateParams = Omit<
  ChatMessageGetParams,
  'messageId' | 'createdAt' | 'updatedAt' | 'messagePublicId'
>;

export class ChatMessage {
  private constructor(private params: ChatMessageGetParams) {}

  static getChatMessage(params: ChatMessageGetParams): ChatMessage {
    return new ChatMessage(params);
  }

  static createChatMessage(
    params: ChatMessageCreateParams,
  ): Result<ChatMessage, ChatMessageDomainErrorValidation> {
    const validationResult = ChatMessage.validateInformation(params);
    if (validationResult.isErr()) {
      return err(validationResult.error);
    }
    return ok(
      new ChatMessage({
        ...params,
        messagePublicId: crypto.randomUUID(),
        messageId: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  }

  get chatSessionId(): number {
    return this.params.chatSessionId;
  }

  get messageId(): number {
    return this.params.messageId;
  }

  get content(): string {
    return this.params.content;
  }

  get role(): CommonChatRole {
    return this.params.role;
  }

  get createdAt(): Date {
    return this.params.createdAt;
  }

  get updatedAt(): Date {
    return this.params.updatedAt;
  }

  private static validateInformation(
    params: ChatMessageCreateParams,
  ): Result<void, ChatMessageDomainErrorValidation> {
    if (params.content.length > 1000) {
      return err(
        new ChatMessageDomainErrorValidation(
          ChatMessageDomainError.ContentTooLong,
          'Content is too long',
        ),
      );
    }

    if (!Object.values(CommonChatRole).includes(params.role)) {
      return err(
        new ChatMessageDomainErrorValidation(
          ChatMessageDomainError.InvalidRole,
          'Invalid role',
        ),
      );
    }

    return ok(undefined);
  }
}
