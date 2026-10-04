import { ConfigService } from '@nestjs/config';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import {
  databaseNow,
  documentListInclude,
  documentListSnapshot,
  nextDocumentVersion,
  lockStorageKey,
} from './document-persistence';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { DocumentVisibility, Prisma } from 'generated/prisma/client';
import { err, ok, Result } from 'neverthrow';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { CommonDocumentStatus } from 'src/shared/domain/enum';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  DocumentTrashResponseDto,
  DocumentDetailResponseDto,
  DocumentListResponseDto,
} from '../application/dtos/document.response.dto';
import { IDocumentQueryRepository } from '../application/interfaces/document-query.repo.interface';
import { Document } from '../domain/entities/document.entity';
import {
  DocumentContentData,
  DocumentMutationSnapshot,
  DocumentIngestionData,
  DocumentStorageData,
  DocumentUpdateData,
  IDocumentRepository,
} from '../domain/repositories/document.repo.interface';
import {
  toDomainStatus,
  toDomainType,
  toDomainVisibility,
  toPrismaStatus,
  toPrismaType,
  toPrismaVisibility,
} from '../document.mapper';
import { toDomainPermission } from './document-permission.mapper';

@Injectable()
export class DocumentRepository
  implements IDocumentRepository, IDocumentQueryRepository
{
  private readonly logger = new Logger(DocumentRepository.name);
  private readonly retentionDays: number;
  constructor(
    private readonly prismaService: PrismaService,
    @Optional() config?: ConfigService,
  ) {
    this.retentionDays = Number(
      config?.get('DOCUMENT_TRASH_RETENTION_DAYS') ?? 30,
    );
    if (!Number.isSafeInteger(this.retentionDays) || this.retentionDays <= 0) {
      throw new Error(
        'DOCUMENT_TRASH_RETENTION_DAYS must be a positive integer',
      );
    }
  }

  async softDeleteDocument(
    publicId: string,
    knowledgeSpaceId: number,
  ): Promise<Result<undefined, AppError>> {
    try {
      return await this.prismaService.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          { id: number }[]
        >`SELECT id FROM document WHERE public_id = ${publicId} AND knowledge_space_id = ${knowledgeSpaceId} FOR UPDATE`;
        if (!rows.length)
          return err(new AppError(ErrorCode.NotFound, 'Document not found'));
        const document = await tx.document.findUniqueOrThrow({
          where: { id: rows[0].id },
        });
        const faq = await tx.knowledgeSpace.findFirst({
          where: { faqDocumentId: document.id },
          select: { id: true },
        });
        if (faq)
          return err(
            new AppError(
              ErrorCode.Conflict,
              'The system FAQ document cannot be deleted',
            ),
          );
        if (document.isDeleted) return ok(undefined);
        const now = await databaseNow(tx);
        await tx.document.update({
          where: { id: document.id },
          data: {
            isDeleted: true,
            deletedAt: now,
            purgeAfter: new Date(now.getTime() + this.retentionDays * 86400000),
            updatedAt: nextDocumentVersion(document.updatedAt, now),
          },
        });
        return ok(undefined);
      });
    } catch (error) {
      this.logger.error('Failed to soft delete document', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to delete document',
        ),
      );
    }
  }

  async restoreDocument(
    publicId: string,
    knowledgeSpaceId: number,
  ): Promise<Result<DocumentListResponseDto, AppError>> {
    try {
      return await this.prismaService.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          { id: number }[]
        >`SELECT id FROM document WHERE public_id = ${publicId} AND knowledge_space_id = ${knowledgeSpaceId} FOR UPDATE`;
        if (!rows.length)
          return err(new AppError(ErrorCode.NotFound, 'Document not found'));
        const document = await tx.document.findUniqueOrThrow({
          where: { id: rows[0].id },
          include: documentListInclude,
        });
        if (!document.isDeleted)
          return err(
            new AppError(ErrorCode.Conflict, 'Document is already active'),
          );
        const now = await databaseNow(tx);
        if (
          !document.purgeAfter ||
          document.purgeAfter <= now ||
          document.purgeStartedAt ||
          document.purgedAt
        ) {
          return err(
            new AppError(ErrorCode.Gone, 'Document can no longer be restored'),
          );
        }
        const restored = await tx.document.update({
          where: { id: document.id },
          data: {
            isDeleted: false,
            deletedAt: null,
            purgeAfter: null,
            purgeStartedAt: null,
            purgedAt: null,
            status:
              document.status === 'Processing' ? 'Failed' : document.status,
            updatedAt: nextDocumentVersion(document.updatedAt, now),
          },
          include: documentListInclude,
        });
        return ok(documentListSnapshot(restored));
      });
    } catch (error) {
      this.logger.error('Failed to restore document', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to restore document',
        ),
      );
    }
  }

  async getDocumentTrash(
    knowledgeSpaceId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentTrashResponseDto>, Error>> {
    try {
      return ok(
        await this.prismaService.$transaction(
          async (tx) => {
            const now = await databaseNow(tx);
            const where: Prisma.DocumentWhereInput = {
              knowledgeSpaceId,
              isDeleted: true,
              purgeAfter: { gt: now },
              purgeStartedAt: null,
              purgedAt: null,
            };
            const documents = await tx.document.findMany({
              where,
              include: documentListInclude,
              orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
              skip: (pagination.pageNumber - 1) * pagination.pageSize,
              take: pagination.pageSize,
            });
            const count = await tx.document.count({ where });
            return new PageResult(
              documents.map((d) => ({
                ...documentListSnapshot(d),
                deletedAt: d.deletedAt!,
                purgeAfter: d.purgeAfter!,
              })),
              count,
              pagination.pageNumber,
              pagination.pageNumber,
              pagination.pageSize,
            );
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
        ),
      );
    } catch (error) {
      this.logger.error('Failed to get document trash', error);
      return err(new Error('Failed to get document trash'));
    }
  }

  async validateCachedDocumentList(
    knowledgeSpaceId: number,
    userId: number,
    pagination: PaginationRequest,
    page: PageResult<DocumentListResponseDto>,
  ): Promise<Result<boolean, Error>> {
    // Re-query the page and count together: same count alone misses reordering and permission changes.
    const current = await this.getDocumentListInKnowledgeSpace(
      knowledgeSpaceId,
      userId,
      pagination,
    );
    if (current.isErr()) return err(current.error);
    return ok(JSON.stringify(current.value) === JSON.stringify(page));
  }

  async canDeleteStorageObject(key: string): Promise<Result<boolean, Error>> {
    try {
      const rows = await this.prismaService.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) AS count FROM document WHERE storage_path = ${key} AND (is_deleted = false OR (purged_at IS NULL AND purge_after > clock_timestamp()))`;
      return ok(Number(rows[0].count) === 0);
    } catch {
      return err(new Error('Failed to check storage references'));
    }
  }

  async getDocumentIngestionDataByPublicId(
    publicId: string,
  ): Promise<Result<DocumentIngestionData | null, Error>> {
    try {
      const document = await this.prismaService.document.findUnique({
        where: { publicId, isDeleted: false },
        select: {
          id: true,
          storagePath: true,
          title: true,
          status: true,
          visibility: true,
          content: true,
          updatedAt: true,
          knowledgeSpaceId: true,
          fileType: true,
          workspace: { select: { publicId: true } },
        },
      });
      if (!document) {
        return ok(null);
      }
      return ok({
        id: document.id,
        knowledgeSpaceId: document.knowledgeSpaceId,
        knowledgeSpacePublicId: document.workspace.publicId,
        storagePath: document.storagePath,
        fileName: document.title,
        content: document.content,
        status: toDomainStatus(document.status),
        updatedAt: document.updatedAt,
        visibility: toDomainVisibility(document.visibility),
        fileType: toDomainType(document.fileType),
      });
    } catch (error) {
      this.logger.error(
        `Failed to get document ingestion data by public ID: ${error}`,
      );
      return err(
        new Error(`Failed to get document ingestion data by public ID`),
      );
    }
  }
  async transitionDocumentStatus(
    documentPublicId: string,
    knowledgeSpaceId: number,
    expectedStatus: CommonDocumentStatus,
    expectedUpdatedAt: Date,
    nextStatus: CommonDocumentStatus,
  ): Promise<Result<Date | null, Error>> {
    try {
      const updatedAt = nextDocumentVersion(expectedUpdatedAt, new Date());
      const result = await this.prismaService.document.updateMany({
        where: {
          publicId: documentPublicId,
          knowledgeSpaceId,
          isDeleted: false,
          status: toPrismaStatus(expectedStatus),
          updatedAt: expectedUpdatedAt,
        },
        data: { status: toPrismaStatus(nextStatus), updatedAt },
      });
      return ok(result.count > 0 ? updatedAt : null);
    } catch (error) {
      this.logger.error('Failed to transition document status', error);
      return err(new Error('Failed to transition document status'));
    }
  }

  async getDocumentStorageDataByPublicId(
    publicId: string,
    knowledgeSpaceId: number,
  ): Promise<Result<DocumentStorageData | null, Error>> {
    try {
      const document = await this.prismaService.document.findUnique({
        where: { publicId, knowledgeSpaceId, isDeleted: false },
        select: {
          id: true,
          storagePath: true,
          title: true,
          visibility: true,
        },
      });
      if (!document) {
        return ok(null);
      }
      return ok({
        id: document.id,
        storagePath: document.storagePath,
        fileName: document.title,
        visibility: toDomainVisibility(document.visibility),
      });
    } catch (error) {
      this.logger.error(
        `Failed to get document storage data by public ID: ${error}`,
      );
      return err(new Error(`Failed to get document storage data by public ID`));
    }
  }
  async getDocumentDetail(
    knowledgeSpaceId: number,
    documentPublicId: string,
  ): Promise<Result<DocumentDetailResponseDto | null, Error>> {
    try {
      const document = await this.prismaService.document.findUnique({
        where: {
          publicId: documentPublicId,
          knowledgeSpaceId: knowledgeSpaceId,
          isDeleted: false,
        },
        select: {
          publicId: true,
          title: true,
          description: true,
          visibility: true,
          status: true,
          fileType: true,
          fileSize: true,
          content: true,
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
          documentPermissions: {
            select: {
              user: {
                select: {
                  email: true,
                  publicId: true,
                },
              },
              permission: true,
            },
          },
          answerSources: {
            orderBy: { message: { createdAt: 'desc' } },
            take: 5, // only take the latest 5 cited questions
            select: {
              message: {
                select: {
                  publicId: true,
                  content: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });

      if (!document) {
        return ok(null);
      }
      const usersAccess = document.documentPermissions?.map((p) => ({
        userPublicId: p.user.publicId,
        email: p.user.email,
        permission: toDomainPermission(p.permission),
      }));

      return ok({
        publicId: document.publicId,
        title: document.title,
        description: document.description,
        visibility: toDomainVisibility(document.visibility),
        status: toDomainStatus(document.status),
        fileType: toDomainType(document.fileType),
        fileSize: Number(document.fileSize),
        content: document.content,
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
        citedQuestion: Array.from(
          // turn the array of answerSources into a Map to remove duplicates, then convert back to an array
          new Map(
            document.answerSources.map((a) => [
              a.message.publicId,
              {
                publicId: a.message.publicId,
                name: a.message.content,
                lastAsked: a.message.createdAt,
              },
            ]),
          ).values(),
        ),
        permissions: usersAccess,
      });
    } catch (error) {
      this.logger.error(`Failed to get document detail: ${error}`);
      return err(new Error(`Failed to get document detail`));
    }
  }
  async getDocumentListInKnowledgeSpace(
    knowledgeSpaceId: number,
    userId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentListResponseDto>, Error>> {
    try {
      const where: Prisma.DocumentWhereInput = {
        knowledgeSpaceId,
        isDeleted: false,
        OR: [
          { visibility: DocumentVisibility.Public },
          {
            visibility: DocumentVisibility.Restricted,
            documentPermissions: { some: { userId } },
          },
        ],
      };
      const [documents, totalDocuments] = await this.prismaService.$transaction(
        [
          this.prismaService.document.findMany({
            where,
            select: {
              publicId: true,
              title: true,
              fileType: true,
              status: true,
              visibility: true,
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
            orderBy: [
              { updatedAt: 'desc' },
              { createdAt: 'desc' },
              { id: 'desc' },
            ],
            skip: (pagination.pageNumber - 1) * pagination.pageSize,
            take: pagination.pageSize,
          }),

          this.prismaService.document.count({
            where,
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
      const documentListResponse: DocumentListResponseDto[] = documents.map(
        (document) => ({
          publicId: document.publicId,
          title: document.title,
          fileType: toDomainType(document.fileType),
          status: toDomainStatus(document.status),
          visibility: toDomainVisibility(document.visibility),
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
  async searchDocumentsInKnowledgeSpace(
    knowledgeSpaceId: number,
    userId: number,
    documentName: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentListResponseDto>, Error>> {
    try {
      const where: Prisma.DocumentWhereInput = {
        knowledgeSpaceId,
        isDeleted: false,
        title: { contains: documentName, mode: 'insensitive' },
        OR: [
          { visibility: DocumentVisibility.Public },
          {
            visibility: DocumentVisibility.Restricted,
            documentPermissions: { some: { userId } },
          },
        ],
      };
      const [documents, totalDocuments] = await this.prismaService.$transaction(
        [
          this.prismaService.document.findMany({
            where,
            select: {
              publicId: true,
              title: true,
              fileType: true,
              status: true,
              visibility: true,
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
                    where: { knowledgeSpaceId },
                  },
                },
              },
            },
            orderBy: [
              { updatedAt: 'desc' },
              { createdAt: 'desc' },
              { id: 'desc' },
            ],
            skip: (pagination.pageNumber - 1) * pagination.pageSize,
            take: pagination.pageSize,
          }),

          this.prismaService.document.count({
            where,
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
      const documentListResponse: DocumentListResponseDto[] = documents.map(
        (document) => ({
          publicId: document.publicId,
          title: document.title,
          fileType: toDomainType(document.fileType),
          status: toDomainStatus(document.status),
          visibility: toDomainVisibility(document.visibility),
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
        `Failed to search documents in knowledge space: ${error}`,
      );
      return err(new Error(`Failed to search documents in knowledge space`));
    }
  }
  async addDocument(newDocument: Document): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.$transaction(async (tx) => {
        await lockStorageKey(tx, newDocument.storagePath);
        const owner = await tx.documentStorageKey.findUnique({
          where: { key: newDocument.storagePath },
        });
        const existing = await tx.document.findFirst({
          where: { storagePath: newDocument.storagePath },
          select: { id: true },
        });
        if (owner || existing)
          throw new AppError(
            ErrorCode.Conflict,
            'Storage key has already been used by a document',
          );
        const created = await tx.document.create({
          data: {
            publicId: newDocument.publicId,
            title: newDocument.title,
            description: newDocument.description,
            content: newDocument.content,
            authorId: newDocument.authorId,
            knowledgeSpaceId: newDocument.knowledgeSpaceId,
            categoryId: newDocument.categoryId,
            status: toPrismaStatus(newDocument.status),
            visibility: toPrismaVisibility(newDocument.visibility),
            storagePath: newDocument.storagePath,
            fileSize: newDocument.fileSize,
            fileType: toPrismaType(newDocument.fileType),
            createdAt: newDocument.createdAt,
            updatedAt: newDocument.updatedAt,
          },
        });
        await tx.documentStorageKey.create({
          data: { key: newDocument.storagePath, documentId: created.id },
        });
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to add document: ${error}`);
      return err(
        error instanceof AppError ? error : new Error('Failed to add document'),
      );
    }
  }
  async updateDocument(
    documentId: number,
    data: DocumentUpdateData,
  ): Promise<Result<DocumentMutationSnapshot, Error>> {
    try {
      const snapshot = await this.prismaService.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
          { updated_at: Date; storage_path: string }[]
        >`SELECT updated_at, storage_path FROM document WHERE id = ${documentId} AND is_deleted = false FOR UPDATE`;
        if (!locked.length)
          throw new AppError(ErrorCode.NotFound, 'Document not found');
        if (data.storagePath && data.storagePath !== locked[0].storage_path) {
          for (const key of [locked[0].storage_path, data.storagePath].sort())
            await lockStorageKey(tx, key);
          // Seed/import paths may bypass repository registration. Reserve the old
          // key before replacing it, and reject any currently referenced new key.
          await tx.documentStorageKey.upsert({
            where: { key: locked[0].storage_path },
            create: { key: locked[0].storage_path, documentId },
            update: {},
          });
          const owner = await tx.documentStorageKey.findUnique({
            where: { key: data.storagePath },
          });
          const existing = await tx.document.findFirst({
            where: { storagePath: data.storagePath },
            select: { id: true },
          });
          if (owner || existing)
            throw new AppError(
              ErrorCode.Conflict,
              'Storage key has already been used by a document',
            );
          await tx.documentStorageKey.create({
            data: { key: data.storagePath, documentId },
          });
        }
        const updatedAt = nextDocumentVersion(
          locked[0].updated_at,
          await databaseNow(tx),
        );
        const written = await tx.document.update({
          where: { id: documentId, isDeleted: false },
          data: {
            updatedAt,
            ...(data.title !== undefined && { title: data.title }),
            ...(data.description !== undefined && {
              description: data.description,
            }),
            ...(data.content !== undefined && { content: data.content }),
            ...(data.categoryId !== undefined && {
              categoryId: data.categoryId,
            }),
            ...(data.visibility !== undefined && {
              visibility: toPrismaVisibility(data.visibility),
            }),
            ...(data.status !== undefined && {
              status: toPrismaStatus(data.status),
            }),
            ...(data.storagePath !== undefined && {
              storagePath: data.storagePath,
            }),
            ...(data.fileSize !== undefined && { fileSize: data.fileSize }),
            ...(data.fileType !== undefined && {
              fileType: toPrismaType(data.fileType),
            }),
          },
        });
        return {
          updatedAt: written.updatedAt,
          status: toDomainStatus(written.status),
        };
      });
      return ok(snapshot);
    } catch (error) {
      this.logger.error('Failed to update document', error);
      return err(
        error instanceof AppError
          ? error
          : new Error('Failed to update document'),
      );
    }
  }
  async getDocumentListItemByPublicId(
    knowledgeSpaceId: number,
    documentPublicId: string,
  ): Promise<Result<DocumentListResponseDto | null, Error>> {
    try {
      const document = await this.prismaService.document.findUnique({
        where: {
          publicId: documentPublicId,
          knowledgeSpaceId,
          isDeleted: false,
        },
        select: {
          publicId: true,
          title: true,
          fileType: true,
          status: true,
          visibility: true,
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
                where: { knowledgeSpaceId },
              },
            },
          },
        },
      });
      if (!document) {
        return ok(null);
      }
      return ok({
        publicId: document.publicId,
        title: document.title,
        fileType: toDomainType(document.fileType),
        status: toDomainStatus(document.status),
        visibility: toDomainVisibility(document.visibility),
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
      });
    } catch (error) {
      this.logger.error(
        `Failed to get document list item by public ID: ${error}`,
      );
      return err(new Error(`Failed to get document list item by public ID`));
    }
  }
  async getDocumentIdByPublicId(
    publicId: string,
    knowledgeSpaceId: number,
  ): Promise<Result<number | null, Error>> {
    try {
      const documentId = await this.prismaService.document.findUnique({
        where: { publicId, knowledgeSpaceId, isDeleted: false },
        select: { id: true },
      });
      return ok(documentId?.id ?? null);
    } catch (error) {
      this.logger.error(`Failed to get document ID by public ID: ${error}`);
      return err(new Error(`Failed to get document ID by public ID`));
    }
  }
  async getDocumentContentById(
    documentId: number,
  ): Promise<Result<DocumentContentData | null, Error>> {
    try {
      const document = await this.prismaService.document.findUnique({
        where: { id: documentId, isDeleted: false },
        select: { publicId: true, content: true },
      });
      if (!document) {
        return ok(null);
      }
      return ok({ publicId: document.publicId, content: document.content });
    } catch (error) {
      this.logger.error(`Failed to get document content by ID: ${error}`);
      return err(new Error(`Failed to get document content by ID`));
    }
  }
}
