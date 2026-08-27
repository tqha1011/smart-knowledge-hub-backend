import { IsUUID, MaxLength } from 'class-validator';

export class ChatMessageRequestDto {
  @IsUUID()
  knowledgeSpacePublicId!: string;
  @IsUUID()
  chatSessionPublicId!: string;
  @MaxLength(4000)
  content!: string;
}
