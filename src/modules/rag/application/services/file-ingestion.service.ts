import { Injectable, Logger } from '@nestjs/common';
import { Result, err, ok } from 'neverthrow';
import { CommonDocumentType } from 'src/shared/domain/enum';
import { DocxParserService } from 'src/shared/infrastructure/parser/docx-parser.service';
import { PDFParserService } from 'src/shared/infrastructure/parser/pdf-parser.service';
import { IFileStorage } from 'src/shared/infrastructure/storage/file-storage.interface';

@Injectable()
export class FileIngestionService {
  private readonly logger = new Logger(FileIngestionService.name);
  constructor(
    private readonly fileStorage: IFileStorage,
    private readonly docxParser: DocxParserService,
    private readonly pdfParser: PDFParserService,
  ) {}

  /**
   * Downloads the stored file and extracts plain text from it, dispatching
   * by `fileType`. Called by ContentIngestionService when a Document has no
   * `content` of its own to ingest directly.
   */
  async extractText(
    storagePath: string,
    fileType: CommonDocumentType,
  ): Promise<Result<string, Error>> {
    const fileBufferResult = await this.fileStorage.GetObject(storagePath);
    if (fileBufferResult.isErr()) {
      this.logger.error(
        `Error retrieving file from storage: ${fileBufferResult.error}`,
      );
      return err(fileBufferResult.error);
    }
    const buffer = fileBufferResult.value;

    switch (fileType) {
      case CommonDocumentType.PDF: {
        const result = await this.pdfParser.parsePDF(buffer);
        if (result.isErr()) {
          this.logger.error(`Error parsing PDF: ${result.error.message}`);
          return err(result.error);
        }
        return ok(result.value);
      }
      case CommonDocumentType.DOCX: {
        const result = await this.docxParser.parseDocx(buffer);
        if (result.isErr()) {
          this.logger.error(`Error parsing DOCX: ${result.error.message}`);
          return err(result.error);
        }
        return ok(result.value);
      }
      case CommonDocumentType.TXT:
      case CommonDocumentType.MD:
        return ok(buffer.toString('utf-8'));
    }
  }
}
