import { IsUUID, MaxLength } from 'class-validator';

export class ChatMessageRequestDto {
  /**
   * @example '6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b'
   */
  @IsUUID()
  knowledgeSpacePublicId!: string;

  /**
   * @example '8d4c1a2b-3e5f-4a6b-9c7d-1e2f3a4b5c6d'
   */
  @IsUUID()
  chatSessionPublicId!: string;

  /**
   * @example 'How do I request time off?'
   */
  @MaxLength(4000)
  content!: string;
}
