import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AddKnowledgeSpaceTypeDto {
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, {
    message: 'Name should not exceed 100 characters long',
  })
  name!: string;
}

export class CreateKnowledgeSpaceDto {
  @IsString({ message: 'Name must be a string' })
  name!: string;

  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, {
    message: 'Description should not exceed 500 characters long',
  })
  description?: string | null;

  @IsUUID()
  typePublicId!: string;
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
  @IsUUID()
  typePublicId?: string | null;
}
