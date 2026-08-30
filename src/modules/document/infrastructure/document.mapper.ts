import {
  DocumentStatus,
  DocumentVisibility,
  FileType,
} from 'generated/prisma/enums';
import {
  CommonDocumentStatus,
  CommonDocumentType,
  CommonDocumentVisibility,
} from 'src/shared/domain/enum';

const roleToPrisma: Record<CommonDocumentStatus, DocumentStatus> = {
  [CommonDocumentStatus.Failed]: DocumentStatus.Failed,
  [CommonDocumentStatus.Processing]: DocumentStatus.Processing,
  [CommonDocumentStatus.Ready]: DocumentStatus.Ready,
};

const roleToDomain: Record<DocumentStatus, CommonDocumentStatus> = {
  [DocumentStatus.Failed]: CommonDocumentStatus.Failed,
  [DocumentStatus.Processing]: CommonDocumentStatus.Processing,
  [DocumentStatus.Ready]: CommonDocumentStatus.Ready,
};

const typeToPrisma: Record<CommonDocumentType, FileType> = {
  [CommonDocumentType.PDF]: FileType.PDF,
  [CommonDocumentType.DOCX]: FileType.DOCX,
  [CommonDocumentType.TXT]: FileType.TXT,
  [CommonDocumentType.MD]: FileType.MD,
};

const typeToDomain: Record<FileType, CommonDocumentType> = {
  [FileType.PDF]: CommonDocumentType.PDF,
  [FileType.DOCX]: CommonDocumentType.DOCX,
  [FileType.TXT]: CommonDocumentType.TXT,
  [FileType.MD]: CommonDocumentType.MD,
};

const visibilityToPrisma: Record<CommonDocumentVisibility, DocumentVisibility> =
  {
    [CommonDocumentVisibility.Public]: DocumentVisibility.Public,
    [CommonDocumentVisibility.Restricted]: DocumentVisibility.Restricted,
  };

const visibilityToDomain: Record<string, CommonDocumentVisibility> = {
  ['Public']: CommonDocumentVisibility.Public,
  ['Restricted']: CommonDocumentVisibility.Restricted,
};

export function toPrismaVisibility(
  visibility: CommonDocumentVisibility,
): DocumentVisibility {
  return visibilityToPrisma[visibility];
}

export function toDomainVisibility(
  visibility: string,
): CommonDocumentVisibility {
  return visibilityToDomain[visibility];
}

export function toPrismaStatus(status: CommonDocumentStatus): DocumentStatus {
  return roleToPrisma[status];
}

export function toDomainStatus(status: DocumentStatus): CommonDocumentStatus {
  return roleToDomain[status];
}

export function toPrismaType(type: CommonDocumentType): FileType {
  return typeToPrisma[type];
}

export function toDomainType(type: FileType): CommonDocumentType {
  return typeToDomain[type];
}
