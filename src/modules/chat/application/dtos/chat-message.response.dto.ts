import { CommonChatRole } from 'src/shared/domain/enum';

export class ChatMessageSourceResponseDto {
  documentPublicId!: string;
  documentTitle!: string;
  excerpt!: string;
  score!: number;
}

export class ChatMessageResponseDto {
  messagePublicId!: string;
  role!: CommonChatRole;
  content!: string;
  createdAt!: Date;
  sources!: ChatMessageSourceResponseDto[];
}
