import { Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { DocumentListResponseDto } from '../application/dtos/document.response.dto';
import { IDocumentQueryRepository } from '../application/interfaces/document-query.repo.interface';
import { Document } from '../domain/entities/document.entity';
import { IDocumentRepository } from '../domain/repositories/document.repo.interface';
import { toDomainType, toPrismaStatus } from './document.mapper';

export class DocumentRepository
  implements IDocumentRepository, IDocumentQueryRepository
{
  private readonly logger = new Logger(DocumentRepository.name);
  constructor(private readonly prismaService: PrismaService) {}
  async getDocumentListInKnowledgeSpace(
    knowledgeSpaceId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentListResponseDto>, Error>> {
    try {
      const [documents, totalDocuments] = await this.prismaService.$transaction(
        [
          this.prismaService.document.findMany({
            where: { knowledgeSpaceId: knowledgeSpaceId },
            select: {
              publicId: true,
              title: true,
              fileType: true,
              updatedAt: true,
              category: {
                select: {
                  publicId: true,
                  name: true,
                },
              },
              author: {
                select: {
                  publicId: true,
                  username: true,
                  avatarUrl: true,
                },
              },
              _count: {
                select: {
                  answerSources: {
                    where: { knowledgeSpaceId: knowledgeSpaceId },
                  },
                },
              },
            },
          }),
          this.prismaService.document.count({
            where: { knowledgeSpaceId: knowledgeSpaceId },
          }),
        ],
      );
      const documentListResponse: DocumentListResponseDto[] = documents.map(
        (document) => ({
          publicId: document.publicId,
          title: document.title,
          fileType: toDomainType(document.fileType),
          lastUpdated: document.updatedAt,
          category: {
            publicId: document.category.publicId,
            name: document.category.name,
          },
          updatedBy: {
            publicId: document.author.publicId,
            name: document.author.username,
            avatarUrl: document.author.avatarUrl,
          },
          cited: document._count.answerSources,
        }),
      );
      return ok(
        new PageResult<DocumentListResponseDto>(
          documentListResponse,
          totalDocuments,
          pagination.pageNumber,
          pagination.pageNumber,
          pagination.pageSize,
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to get document list in knowledge space: ${error}`,
      );
      return err(new Error(`Failed to get document list in knowledge space`));
    }
  }
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
