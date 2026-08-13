import { Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { IDocumentRepository } from '../domain/repositories/document.repo.interface';

export class DocumentRepository implements IDocumentRepository {
  constructor(private readonly prismaService: PrismaService) {}
  private readonly logger = new Logger(DocumentRepository.name);
  async getDocumentIdByPublicId(
    publicId: string,
  ): Promise<Result<number | null, Error>> {
    try {
      const documentId = await this.prismaService.document.findUnique({
        where: { publicId },
        select: { id: true },
      });
      return ok(documentId?.id || null);
    } catch (error) {
      this.logger.error(`Failed to get document ID by public ID: ${error}`);
      return err(new Error(`Failed to get document ID by public ID`));
    }
  }
}
