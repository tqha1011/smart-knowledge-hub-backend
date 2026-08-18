import { Result } from 'neverthrow';
import { Document } from '../entities/document.entity';

export type DocumentStorageData = {
  storagePath: string;
  fileName: string;
};
export abstract class IDocumentRepository {
  abstract getDocumentIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>>;

  abstract addDocument(
    newDocument: Document,
  ): Promise<Result<undefined, Error>>;

  abstract getDocumentStorageDataByPublicId(
    publicId: string,
  ): Promise<Result<DocumentStorageData | null, Error>>;
}
