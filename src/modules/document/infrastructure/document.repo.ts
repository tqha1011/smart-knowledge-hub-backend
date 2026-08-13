import { Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { Document } from '../domain/entities/document.entity';
import { IDocumentRepository } from '../domain/repositories/document.repo.interface';
import { toPrismaStatus } from './document.mapper';

export class DocumentRepository implements IDocumentRepository {
  private readonly logger = new Logger(DocumentRepository.name);
  constructor(private readonly prismaService: PrismaService) {}
  async addDocument(newDocument: Document): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.document.create({
        data: {
          publicId: newDocument.publicId,
          title: newDocument.title,
          description: newDocument.description,
          content: newDocument.content,
          authorId: newDocument.authorId,
          knowledgeSpaceId: newDocument.knowledgeSpaceId,
          categoryId: newDocument.categoryId,
          status: toPrismaStatus(newDocument.status),
          visibility: newDocument.visibility,
          storagePath: newDocument.storagePath,
          fileSize: newDocument.fileSize,
          fileType: newDocument.fileType,
          createdAt: newDocument.createdAt,
          updatedAt: newDocument.updatedAt,
        },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to add document: ${error}`);
      return err(new Error(`Failed to add document`));
    }
  }
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
