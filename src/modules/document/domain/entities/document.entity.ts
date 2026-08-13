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

  get id(): number {
    return this.params.id;
  }

  get publicId(): string {
    return this.params.publicId;
  }

  get title(): string {
    return this.params.title;
  }

  get description(): string | null {
    return this.params.description;
  }

  get content(): string | null {
    return this.params.content;
  }

  get authorId(): number {
    return this.params.authorId;
  }

  get knowledgeSpaceId(): number {
    return this.params.knowledgeSpaceId;
  }

  get categoryId(): number {
    return this.params.categoryId;
  }

  get status(): CommonDocumentStatus {
    return this.params.status;
  }

  get visibility(): CommonDocumentVisibility {
    return this.params.visibility;
  }

  get storagePath(): string {
    return this.params.storagePath;
  }

  get fileSize(): number {
    return this.params.fileSize;
  }

  get fileType(): CommonDocumentType {
    return this.params.fileType;
  }

  get createdAt(): Date {
    return this.params.createdAt;
  }

  get updatedAt(): Date {
    return this.params.updatedAt;
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
