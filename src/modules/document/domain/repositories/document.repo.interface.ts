import { Result } from 'neverthrow';
import {
  CommonDocumentStatus,
  CommonDocumentType,
  CommonDocumentVisibility,
} from 'src/shared/domain/enum';
import { Document, DocumentUpdateParams } from '../entities/document.entity';

export type DocumentStorageData = {
  id: number;
  storagePath: string;
  fileName: string;
  visibility: CommonDocumentVisibility;
};

export type DocumentIngestionData = {
  id: number;
  knowledgeSpaceId: number;
  storagePath: string;
  fileName: string;
  content: string | null;
  status: CommonDocumentStatus;
  visibility: CommonDocumentVisibility;
  fileType: CommonDocumentType;
};

export type DocumentUpdateData = DocumentUpdateParams & {
  status?: CommonDocumentStatus;
};

export type DocumentContentData = {
  publicId: string;
  content: string | null;
};

export abstract class IDocumentRepository {
  abstract getDocumentIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>>;

  abstract addDocument(
    newDocument: Document,
  ): Promise<Result<undefined, Error>>;

  /** Scoped by knowledge space so a member of one cannot reach another's files. */
  abstract getDocumentStorageDataByPublicId(
    publicId: string,
    knowledgeSpaceId: number,
  ): Promise<Result<DocumentStorageData | null, Error>>;

  abstract getDocumentIngestionDataByPublicId(
    publicId: string,
  ): Promise<Result<DocumentIngestionData | null, Error>>;

  abstract updateDocumentStatus(
    documentId: number,
    status: CommonDocumentStatus,
  ): Promise<Result<undefined, Error>>;

  abstract updateDocument(
    documentId: number,
    data: DocumentUpdateData,
  ): Promise<Result<undefined, Error>>;

  abstract getDocumentContentById(
    documentId: number,
  ): Promise<Result<DocumentContentData | null, Error>>;
}
