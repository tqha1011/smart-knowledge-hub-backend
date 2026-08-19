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
  @IsString()
  fileName!: string;

  @IsString()
  contentType!: string;

  @IsInt()
  @IsPositive()
  fileSize!: number;
}

/** Step 2: the file already sits in R2, so only its key travels with the metadata. */
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

  /** The key returned by the upload-url step; the real size is read back from R2. */
  @IsString()
  storageKey!: string;

  @IsEnum(CommonDocumentVisibility)
  @IsOptional()
  visibility?: CommonDocumentVisibility;
}

export class DocumentPermissionRequestDto {
  @IsUUID()
  userPublicId!: string;

  @IsEnum(CommonPermissionType)
  permission!: CommonPermissionType;
}

export class AddDocumentPermissionRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentPermissionRequestDto)
  permissions!: DocumentPermissionRequestDto[];
}
