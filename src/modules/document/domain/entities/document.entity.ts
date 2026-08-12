import {
  CommonDocumentType,
  CommonDocumentVisibility,
} from 'src/shared/domain/enum';
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
