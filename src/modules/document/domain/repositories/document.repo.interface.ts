import { Result } from 'neverthrow';
import { Document } from '../entities/document.entity';

export type DocumentStorageData = {
  id: number;
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

  /** Scoped by knowledge space so a member of one cannot reach another's files. */
  abstract getDocumentStorageDataByPublicId(
    publicId: string,
    knowledgeSpaceId: number,
  ): Promise<Result<DocumentStorageData | null, Error>>;
}
