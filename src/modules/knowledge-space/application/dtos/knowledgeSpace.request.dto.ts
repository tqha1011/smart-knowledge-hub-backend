import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { KnowledgeSpaceType } from 'src/shared/domain/enum';

export class CreateKnowledgeSpaceDto {
  @IsString({ message: 'Name must be a string' })
  name!: string;

  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, {
    message: 'Description should not exceed 500 characters long',
  })
  description?: string | null;

  @IsEnum(KnowledgeSpaceType, {
    message: 'Type must be a valid KnowledgeSpaceType',
  })
  type!: KnowledgeSpaceType;
}

export class UpdateKnowledgeSpaceDto {
  @IsUUID()
  knowledgeSpacePublicId!: string;

  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  name?: string | null;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, {
    message: 'Description should not exceed 500 characters long',
  })
  description?: string | null;

  @IsOptional()
  @IsEnum(KnowledgeSpaceType, {
    message: 'Type must be a valid KnowledgeSpaceType',
  })
  type?: KnowledgeSpaceType;
}
