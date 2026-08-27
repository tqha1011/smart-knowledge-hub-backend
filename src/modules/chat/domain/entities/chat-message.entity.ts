export type ChatMessageGetParams = {
  readonly chatSessionId: number;
  readonly messageId: number;
  readonly content: string;
  readonly createdAt: Date;
  updatedAt: Date;
};
