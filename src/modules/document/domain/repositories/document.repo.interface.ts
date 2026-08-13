import { Result } from 'neverthrow';

export abstract class IDocumentRepository {
  abstract getDocumentIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>>;
}
