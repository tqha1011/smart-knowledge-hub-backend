import { CommonChatRole } from 'src/shared/domain/enum';

export type ChatMessageGetParams = {
  readonly chatSessionId: number;
  readonly messageId: number;
  readonly content: string;
  readonly role: CommonChatRole;
  readonly createdAt: Date;
  updatedAt: Date;
};

export type ChatMessageCreateParams = Omit<
  ChatMessageGetParams,
  'messageId' | 'createdAt' | 'updatedAt'
>;

export class ChatMessage {
  private constructor(private params: ChatMessageGetParams) {}

  static getChatMessage(params: ChatMessageGetParams): ChatMessage {
    return new ChatMessage(params);
  }

  static createChatMessage(params: ChatMessageCreateParams): ChatMessage {
    return new ChatMessage({
      ...params,
      messageId: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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
}
