import { IsOptional, IsString, IsUUID } from 'class-validator';

export class DocumentCreateRequestDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsString()
  @IsOptional()
  content?: string | null; // in case they want to create a document without content, we allow null value

  @IsUUID()
  categoryPublicId!: string;
}
