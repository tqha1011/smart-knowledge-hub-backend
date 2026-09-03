import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';

export class AddKnowledgeSpaceTypeDto {
  /**
   * @example 'HANDBOOK'
   */
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, {
    message: 'Name should not exceed 100 characters long',
  })
  name!: string;
}

export class CreateKnowledgeSpaceDto {
  /**
   * @example 'Engineering handbook'
   */
  @IsString({ message: 'Name must be a string' })
  name!: string;

  /**
   * @example 'Everything a new engineer needs'
   */
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, {
    message: 'Description should not exceed 500 characters long',
  })
  description?: string | null;

  /**
   * @example '6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b'
   */
  @IsUUID()
  typePublicId!: string;
}

export class UpdateKnowledgeSpaceDto {
  /**
   * @example '6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b'
   */
  @IsUUID()
  knowledgeSpacePublicId!: string;

  /**
   * @example 'Engineering handbook'
   */
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  name?: string | null;

  /**
   * @example 'Everything a new engineer needs'
   */
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, {
    message: 'Description should not exceed 500 characters long',
  })
  description?: string | null;

  /**
   * @example '6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b'
   */
  @IsOptional()
  @IsUUID()
  typePublicId?: string | null;
}

export class AddMemberRequestDto {
  /**
   * @example '6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b'
   */
  @IsUUID()
  userPublicId!: string;

  /**
   * @example 'Editor'
   */
  @IsEnum(KnowledgeSpaceRole)
  role!: KnowledgeSpaceRole;
}

export class AddMembersRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddMemberRequestDto)
  members!: AddMemberRequestDto[];
}

export class KickMembersRequestDto {
  /**
   * @example ['6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b']
   */
  @IsArray()
  @IsUUID(undefined, { each: true })
  userPublicIds!: string[];
}

export class UpdateMemberRoleRequestDto {
  /**
   * @example 'Editor'
   */
  @IsEnum(KnowledgeSpaceRole)
  role!: KnowledgeSpaceRole;
}
