// import { Logger } from '@nestjs/common';
// import { Result, err } from 'neverthrow';
// import { IDocumentRepository } from 'src/modules/document/domain/repositories/document.repo.interface';
// import { AppError } from 'src/shared/common/errorCode';
// import { IDocumentIngestionService } from '../interfaces/document.ingestion.interface';

// export class ContentIngestionService implements IDocumentIngestionService {
//   private readonly logger = new Logger(ContentIngestionService.name);
//   constructor(private readonly documentRepository: IDocumentRepository) {}
//   async ingestDocument(
//     documentPublicId: string,
//   ): Promise<Result<undefined, AppError>> {
//     try {
//       const document =
//         await this.documentRepository.getDocumentIngestionDataByPublicId(
//           documentPublicId,
//         );
//     } catch (error) {
//       this.logger.error(
//         `Error ingesting document with public ID ${documentPublicId}: ${error}`,
//       );
//       return err(new AppError('Failed to ingest document'));
//     }
//   }
// }
