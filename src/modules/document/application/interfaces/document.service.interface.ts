import { Result } from 'neverthrow';
import { DocumentCreateRequestDto } from '../dtos/document.request.dto';

export abstract class IDocumentService {
  abstract createDocumentAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentCreateRequestDto: DocumentCreateRequestDto,
  ): Promise<Result<void, Error>>;
}
