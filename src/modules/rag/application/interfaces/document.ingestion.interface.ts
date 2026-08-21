import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';

export abstract class IDocumentIngestionService {
  abstract ingestDocument(
    documentPublicId: string,
  ): Promise<Result<undefined, AppError>>;
}
