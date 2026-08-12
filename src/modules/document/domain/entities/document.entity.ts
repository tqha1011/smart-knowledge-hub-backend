import { randomUUID } from 'crypto';
import { Result, err, ok } from 'neverthrow';
import {
  CommonDocumentType,
  CommonDocumentVisibility,
} from 'src/shared/domain/enum';
import {
  DocumentDomainError,
  DocumentDomainErrorValidation,
} from '../errors/document-domain.error';
import { CommonDocumentStatus } from './../../../../shared/domain/enum';

export type DocumentGetParams = {
  readonly id: number;
  readonly publicId: string;
  readonly title: string;
  readonly description: string | null;
  readonly content: string | null;
  readonly authorId: number;
  readonly knowledgeSpaceId: number;
  readonly categoryId: number;
  readonly status: CommonDocumentStatus;
  readonly visibility: CommonDocumentVisibility;
  readonly storagePath: string;
  readonly fileSize: number;
  readonly fileType: CommonDocumentType;
  readonly createdAt: Date;
  updatedAt: Date;
};

export type DocumentCreateParams = {
  readonly title: string;
  readonly description: string | null;
  readonly content: string | null;
  readonly authorId: number;
  readonly knowledgeSpaceId: number;
  readonly categoryId: number;
  readonly visibility: CommonDocumentVisibility;
  readonly storagePath: string;
  readonly fileSize: number;
  readonly fileType: CommonDocumentType;
};
export class Document {
  private constructor(private params: DocumentGetParams) {}

  static getDocument(params: DocumentGetParams): Document {
    return new Document(params);
  }

  static createDocument(
    params: DocumentCreateParams,
  ): Result<Document, DocumentDomainErrorValidation> {
    const validationResult = Document.valideteInformation(params);
    if (validationResult.isErr()) {
      return err(validationResult.error);
    }
    return ok(
      new Document({
        ...params,
        id: 0,
        publicId: randomUUID(),
        status: CommonDocumentStatus.Processing,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  }

  private static valideteInformation(
    params: DocumentCreateParams,
  ): Result<undefined, DocumentDomainErrorValidation> {
    if (params.title && params.title.length > 255) {
      return err(
        new DocumentDomainErrorValidation(
          DocumentDomainError.TitleTooLong,
          'Document title can not exceed 255 characters',
        ),
      );
    }

    if (params.description && params.description.length > 500) {
      return err(
        new DocumentDomainErrorValidation(
          DocumentDomainError.DescriptionTooLong,
          'Document description can not exceed 500 characters',
        ),
      );
    }
    return ok(undefined);
  }
}
