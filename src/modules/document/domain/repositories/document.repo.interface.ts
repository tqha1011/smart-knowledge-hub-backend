import { Result } from 'neverthrow';

export abstract class IDocumentRepository {
  abstract getDocumentIdByPublicId(
    publicId: string,
  ): Result<Promise<number | null>, Error>;
}
