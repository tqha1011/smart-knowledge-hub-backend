import { DocumentStatus } from 'generated/prisma/enums';
import { CommonDocumentStatus } from 'src/shared/domain/enum';

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

export function toPrismaStatus(status: CommonDocumentStatus): DocumentStatus {
  return roleToPrisma[status];
}

export function toDomainStatus(status: DocumentStatus): CommonDocumentStatus {
  return roleToDomain[status];
}
