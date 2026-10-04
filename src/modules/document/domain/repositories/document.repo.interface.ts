import { AppError } from 'src/shared/common/errorCode';
import { DocumentListResponseDto } from '../../application/dtos/document.response.dto';
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
  knowledgeSpacePublicId: string;
  storagePath: string;
  fileName: string;
  content: string | null;
  status: CommonDocumentStatus;
  updatedAt: Date;
  visibility: CommonDocumentVisibility;
  fileType: CommonDocumentType;
};

export type DocumentUpdateData = DocumentUpdateParams & {
  status?: CommonDocumentStatus;
};

export type DocumentMutationSnapshot = {
  updatedAt: Date;
  status: CommonDocumentStatus;
};

export type DocumentContentData = {
  publicId: string;
  content: string | null;
};

export abstract class IDocumentRepository {
  abstract softDeleteDocument(
    publicId: string,
    knowledgeSpaceId: number,
  ): Promise<Result<undefined, AppError>>;
  abstract restoreDocument(
    publicId: string,
    knowledgeSpaceId: number,
  ): Promise<Result<DocumentListResponseDto, AppError>>;
  abstract canDeleteStorageObject(key: string): Promise<Result<boolean, Error>>;

  abstract getDocumentIdByPublicId(
    publicId: string,
    knowledgeSpaceId: number,
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

  /** Returns null if the document no longer matches the expected snapshot. */
  abstract transitionDocumentStatus(
    documentPublicId: string,
    knowledgeSpaceId: number,
    expectedStatus: CommonDocumentStatus,
    expectedUpdatedAt: Date,
    nextStatus: CommonDocumentStatus,
  ): Promise<Result<Date | null, Error>>;

  abstract updateDocument(
    documentId: number,
    data: DocumentUpdateData,
  ): Promise<Result<DocumentMutationSnapshot, Error>>;

  abstract getDocumentContentById(
    documentId: number,
  ): Promise<Result<DocumentContentData | null, Error>>;
}
