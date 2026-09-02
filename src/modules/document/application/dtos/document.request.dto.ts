import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  CommonDocumentVisibility,
  CommonPermissionType,
} from 'src/shared/domain/enum';

/** Step 1 of the upload flow: the client asks for a URL to PUT the file straight to R2. */
export class DocumentUploadUrlRequestDto {
  /**
   * @example 'employee-handbook.pdf'
   */
  @IsString()
  fileName!: string;

  /**
   * @example 'application/pdf'
   */
  @IsString()
  contentType!: string;

  /**
   * @example 204800
   */
  @IsInt()
  @IsPositive()
  fileSize!: number;
}

/** Step 2: the file already sits in R2, so only its key travels with the metadata. */
export class DocumentCreateRequestDto {
  /**
   * @example 'Employee handbook'
   */
  @IsString()
  name!: string;

  /**
   * @example 'Company policies and onboarding guide'
   */
  @IsString()
  @IsOptional()
  description?: string | null;

  /**
   * Optional so a document can be created without content.
   * @example 'Welcome to the team! This document covers...'
   */
  @IsString()
  @IsOptional()
  content?: string | null;

  /**
   * @example '6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b'
   */
  @IsUUID()
  categoryPublicId!: string;

  /**
   * The key returned by the upload-url step; the real size is read back from R2.
   * @example 'documents/8d4c1a2b-3e5f-4a6b-9c7d-1e2f3a4b5c6d/employee-handbook.pdf'
   */
  @IsString()
  storageKey!: string;

  /**
   * @example 'Public'
   */
  @IsEnum(CommonDocumentVisibility)
  @IsOptional()
  visibility?: CommonDocumentVisibility;
}

export class DocumentPermissionRequestDto {
  /**
   * @example '6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b'
   */
  @IsUUID()
  userPublicId!: string;

  /**
   * @example 'Read'
   */
  @IsEnum(CommonPermissionType)
  permission!: CommonPermissionType;
}

export class AddDocumentPermissionRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentPermissionRequestDto)
  permissions!: DocumentPermissionRequestDto[];
}

export class DocumentUpdateRequestDto {
  /**
   * @example 'Employee handbook'
   */
  @IsString()
  @IsOptional()
  name?: string | null;

  /**
   * @example 'Welcome to the team! This document covers...'
   */
  @IsString()
  @IsOptional()
  content?: string | null;

  /**
   * @example 'Company policies and onboarding guide'
   */
  @IsString()
  @IsOptional()
  description?: string | null;

  /**
   * @example 'Public'
   */
  @IsEnum(CommonDocumentVisibility)
  @IsOptional()
  visibility?: CommonDocumentVisibility | null;

  @IsOptional()
  @IsUUID()
  categoryPublicId?: string | null;

  @IsOptional()
  permissions?: AddDocumentPermissionRequestDto | [];
}
