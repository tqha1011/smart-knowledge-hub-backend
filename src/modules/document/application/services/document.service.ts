import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { ICategoryRepository } from 'src/modules/category/domain/repositories/category.repo.interface';
import { authorizeMembership } from 'src/modules/knowledge-space/application/services/authorizeMembership';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import {
  CommonContentDisposition,
  CommonDocumentStatus,
  CommonDocumentType,
  CommonDocumentVisibility,
  KnowledgeSpaceRole,
} from 'src/shared/domain/enum';
import { EventName } from 'src/shared/infrastructure/queue/constant/event-name';
import { QueueName } from 'src/shared/infrastructure/queue/constant/queue-name';
import { CacheKey } from 'src/shared/domain/cacheKey';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { IFileStorage } from 'src/shared/infrastructure/storage/file-storage.interface';
import {
  Document,
  DocumentUpdateParams,
} from '../../domain/entities/document.entity';
import { IDocumentPermissionRepository } from '../../domain/repositories/document-permission.repo.interface';
import { IDocumentRepository } from '../../domain/repositories/document.repo.interface';
import { IDocumentQueryRepository } from '../interfaces/document-query.repo.interface';
import {
  DocumentCreateRequestDto,
  DocumentUpdateRequestDto,
  DocumentUploadUrlRequestDto,
  SearchDocumentQueryDto,
} from '../dtos/document.request.dto';
import {
  DocumentTrashResponseDto,
  DocumentDetailResponseDto,
  DocumentListResponseDto,
  DocumentUploadUrlResponseDto,
} from '../dtos/document.response.dto';
import { IDocumentService } from '../interfaces/document.service.interface';

import {
  DocumentStatusPayload,
  IRealtimeNotifier,
} from 'src/shared/infrastructure/notification/realtime-notifier.interface';

const EXTENSION_TO_FILE_TYPE: Record<string, CommonDocumentType> = {
  pdf: CommonDocumentType.PDF,
  docx: CommonDocumentType.DOCX,
  txt: CommonDocumentType.TXT,
  md: CommonDocumentType.MD,
};

@Injectable()
export class DocumentService implements IDocumentService {
  private readonly logger = new Logger(DocumentService.name);
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly documentQueryRepository: IDocumentQueryRepository,
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
    private readonly categoryRepository: ICategoryRepository,
    private readonly userRepository: IUserRepository,
    private readonly fileStorage: IFileStorage,
    private readonly documentPermissionRepository: IDocumentPermissionRepository,
    @InjectQueue(QueueName.IngestionQueue) private ingestionQueue: Queue,
    private readonly cache: IApplicationCache,
    private readonly realtimeNotifier: IRealtimeNotifier,
  ) {}

  async deleteDocumentAsync(
    space: string,
    user: string,
    document: string,
  ): Promise<Result<undefined, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          user,
          space,
        ),
        KnowledgeSpaceRole.Editor,
        'delete document',
      );
      if (membership.isErr()) return err(membership.error);
      const result = await this.documentRepository.softDeleteDocument(
        document,
        membership.value.knowledgeSpaceId,
      );
      if (result.isOk())
        await this.invalidateDocumentList(
          space,
          membership.value.knowledgeSpaceId,
        );
      return result;
    } catch (error) {
      this.logger.error('Failed to delete document', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to delete document',
        ),
      );
    }
  }

  async restoreDocumentAsync(
    space: string,
    user: string,
    document: string,
  ): Promise<Result<DocumentListResponseDto, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          user,
          space,
        ),
        KnowledgeSpaceRole.Editor,
        'restore document',
      );
      if (membership.isErr()) return err(membership.error);
      const result = await this.documentRepository.restoreDocument(
        document,
        membership.value.knowledgeSpaceId,
      );
      if (result.isOk())
        await this.invalidateDocumentList(
          space,
          membership.value.knowledgeSpaceId,
        );
      return result;
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

  async getDocumentTrashAsync(
    space: string,
    user: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentTrashResponseDto>, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          user,
          space,
        ),
        KnowledgeSpaceRole.Editor,
        'view document trash',
      );
      if (membership.isErr()) return err(membership.error);
      const result = await this.documentQueryRepository.getDocumentTrash(
        membership.value.knowledgeSpaceId,
        pagination,
      );
      if (result.isErr())
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to get document trash',
          ),
        );
      return ok(result.value);
    } catch (error) {
      this.logger.error('Failed to get document trash', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to get document trash',
        ),
      );
    }
  }

  async retryIngestDocumentAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentPublicId: string,
  ): Promise<Result<DocumentListResponseDto, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Editor,
        'retry document ingestion',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const knowledgeSpaceId = membership.value.knowledgeSpaceId;
      const snapshot =
        await this.documentQueryRepository.getDocumentListItemByPublicId(
          knowledgeSpaceId,
          documentPublicId,
        );
      if (snapshot.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to get document for retry',
          ),
        );
      }
      if (snapshot.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Document not found'));
      }
      if (snapshot.value.status !== CommonDocumentStatus.Failed) {
        return err(
          new AppError(
            ErrorCode.Conflict,
            'Only failed documents can be retried',
          ),
        );
      }

      const transition = await this.documentRepository.transitionDocumentStatus(
        documentPublicId,
        knowledgeSpaceId,
        CommonDocumentStatus.Failed,
        snapshot.value.lastUpdated,
        CommonDocumentStatus.Processing,
      );
      if (transition.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to transition document for retry',
          ),
        );
      }
      if (transition.value === null) {
        return err(
          new AppError(
            ErrorCode.Conflict,
            'Document changed before retry could start',
          ),
        );
      }

      await this.invalidateDocumentList(
        knowledgeSpacePublicId,
        knowledgeSpaceId,
      );
      try {
        await this.ingestionQueue.add(
          EventName.IngestionDocument,
          {
            documentPublicId,
            expectedUpdatedAt: transition.value.toISOString(),
          },
          { attempts: 3 },
        );
      } catch (error) {
        this.logger.error(
          `Failed to enqueue document ingestion for document ${documentPublicId}`,
          error,
        );
        let failedAt: Date | null = null;
        try {
          // Restore only this retry; a worker or a newer edit may have changed it.
          const rollback =
            await this.documentRepository.transitionDocumentStatus(
              documentPublicId,
              knowledgeSpaceId,
              CommonDocumentStatus.Processing,
              transition.value,
              CommonDocumentStatus.Failed,
            );
          if (rollback.isErr()) {
            this.logger.error(
              'Failed to restore failed document status',
              rollback.error,
            );
          } else {
            failedAt = rollback.value;
          }
        } catch (rollbackError) {
          this.logger.error(
            'Failed to restore failed document status',
            rollbackError,
          );
        }
        await this.invalidateDocumentList(
          knowledgeSpacePublicId,
          knowledgeSpaceId,
        );
        if (failedAt !== null) {
          await this.notifyFailed(knowledgeSpaceId, {
            documentPublicId,
            knowledgeSpacePublicId,
            fileName: snapshot.value.title,
            status: 'Failed',
            updatedAt: failedAt.toISOString(),
          });
        }
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to enqueue document ingestion',
          ),
        );
      }

      // Use the claimed snapshot even if the worker already completed ingestion.
      return ok({
        ...snapshot.value,
        status: CommonDocumentStatus.Processing,
        lastUpdated: transition.value,
      });
    } catch (error) {
      this.logger.error('Failed to retry document ingestion', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to retry document ingestion',
        ),
      );
    }
  }

  async getUploadUrlAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentUploadUrlRequestDto: DocumentUploadUrlRequestDto,
  ): Promise<Result<DocumentUploadUrlResponseDto, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Editor,
        'upload document',
      );

      if (membership.isErr()) {
        return err(membership.error);
      }

      const fileType = this.resolveFileType(
        documentUploadUrlRequestDto.fileName,
      );
      if (fileType === null) {
        return err(
          new AppError(
            ErrorCode.BadRequest,
            'Unsupported file type. Only PDF, DOCX, TXT and MD are accepted',
          ),
        );
      }

      const storageKey = this.buildStorageKey(
        knowledgeSpacePublicId,
        documentUploadUrlRequestDto.fileName,
      );

      const presigned = await this.fileStorage.GetUploadUrl({
        key: storageKey,
        contentType: documentUploadUrlRequestDto.contentType,
        contentLength: documentUploadUrlRequestDto.fileSize,
      });

      if (presigned.isErr()) {
        return err(presigned.error);
      }

      return ok({
        uploadUrl: presigned.value.uploadUrl,
        storageKey: presigned.value.key,
        expiresAt: presigned.value.expiresAt,
      });
    } catch (error) {
      this.logger.error('Failed to generate document upload URL', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to generate document upload URL',
        ),
      );
    }
  }

  async getDownloadUrlAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentPublicId: string,
    disposition: CommonContentDisposition,
  ): Promise<Result<string, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Viewer,
        'download/watch document',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }
      const documentData =
        await this.documentRepository.getDocumentStorageDataByPublicId(
          documentPublicId,
          membership.value.knowledgeSpaceId,
        );
      if (documentData.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to resolve document storage data',
          ),
        );
      }
      if (documentData.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Document not found'));
      }
      if (
        documentData.value.visibility === CommonDocumentVisibility.Restricted
      ) {
        const permissionResult =
          await this.documentPermissionRepository.checkDocumentPermission(
            documentData.value.id,
            membership.value.userId,
          );
        if (permissionResult.isErr()) {
          return err(
            new AppError(
              ErrorCode.InternalServerError,
              'Failed to check document permission',
            ),
          );
        }
        if (permissionResult.value === null) {
          return err(new AppError(ErrorCode.Forbidden, 'Access denied'));
        }
      }
      const downloadUrl = await this.fileStorage.GetDownloadUrl(
        documentData.value.storagePath,
        documentData.value.fileName,
        disposition,
      );
      if (downloadUrl.isErr()) {
        return err(downloadUrl.error);
      }
      return ok(downloadUrl.value);
    } catch (error) {
      this.logger.error('Failed to generate document download URL', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to generate document download URL',
        ),
      );
    }
  }
  async createDocumentAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentCreateRequestDto: DocumentCreateRequestDto,
  ): Promise<Result<DocumentListResponseDto, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Editor,
        'create document',
      );

      if (membership.isErr()) {
        return err(membership.error);
      }

      const categoryResult =
        await this.categoryRepository.getCategoryIdByPublicId(
          documentCreateRequestDto.categoryPublicId,
          membership.value.knowledgeSpaceId,
        );

      if (categoryResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to resolve category',
          ),
        );
      }

      if (categoryResult.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Category not found'));
      }

      const authorData =
        await this.userRepository.GetUserDataByPublicId(userPublicId);
      if (authorData.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to resolve author data',
          ),
        );
      }

      if (authorData.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Author not found'));
      }
      const categoryId = categoryResult.value.id;

      const fileType = this.resolveFileType(documentCreateRequestDto.name);
      if (fileType === null) {
        return err(
          new AppError(
            ErrorCode.BadRequest,
            'Unsupported file type. Only PDF, DOCX, TXT and MD are accepted',
          ),
        );
      }

      // A key from another workspace would otherwise let its file be re-registered here.
      if (
        !documentCreateRequestDto.storageKey.startsWith(
          this.storageKeyPrefix(knowledgeSpacePublicId),
        )
      ) {
        return err(
          new AppError(
            ErrorCode.BadRequest,
            'Storage key does not belong to this knowledge space',
          ),
        );
      }

      // The presigned URL never signs a content type, so the size is read back from
      // storage rather than taken from the client. A miss means nothing was uploaded.
      const objectMetadata = await this.fileStorage.GetObjectMetadata(
        documentCreateRequestDto.storageKey,
      );
      if (objectMetadata.isErr()) {
        return err(objectMetadata.error);
      }

      if (objectMetadata.value === null) {
        return err(
          new AppError(
            ErrorCode.BadRequest,
            'No uploaded file was found for the given storage key',
          ),
        );
      }

      const newDocument = Document.createDocument({
        title: documentCreateRequestDto.name,
        description: documentCreateRequestDto.description ?? null,
        content: documentCreateRequestDto.content ?? null,
        knowledgeSpaceId: membership.value.knowledgeSpaceId,
        authorId: membership.value.userId,
        categoryId: categoryId,
        visibility:
          documentCreateRequestDto.visibility ??
          CommonDocumentVisibility.Public,
        storagePath: documentCreateRequestDto.storageKey,
        fileSize: objectMetadata.value.contentLength,
        fileType: fileType,
      });
      if (newDocument.isErr()) {
        return err(
          new AppError(
            ErrorCode.BadRequest,
            'Failed to create document entity',
          ),
        );
      }
      const addDocumentResult = await this.documentRepository.addDocument(
        newDocument.value,
      );
      if (addDocumentResult.isErr()) {
        if (addDocumentResult.error instanceof AppError)
          return err(addDocumentResult.error);
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to add document to repository',
          ),
        );
      }
      await this.invalidateDocumentList(
        knowledgeSpacePublicId,
        membership.value.knowledgeSpaceId,
      );

      const documentListResponseDto: DocumentListResponseDto = {
        publicId: newDocument.value.publicId,
        title: newDocument.value.title,
        fileType: newDocument.value.fileType,
        status: newDocument.value.status,
        visibility: newDocument.value.visibility,
        lastUpdated: newDocument.value.updatedAt,
        category: {
          publicId: documentCreateRequestDto.categoryPublicId,
          name: categoryResult.value.name,
        },
        updatedBy: {
          publicId: userPublicId,
          name: authorData.value.name,
          avatarUrl: authorData.value.avatarUrl,
        },
        cited: 0,
      };

      // push to ingestion queue for further processing (e.g., text extraction, indexing, etc.)
      try {
        await this.ingestionQueue.add(
          EventName.IngestionDocument,
          {
            documentPublicId: newDocument.value.publicId,
            expectedUpdatedAt: newDocument.value.updatedAt.toISOString(),
          },
          {
            attempts: 3, // retry up to 3 times in case of failure
          },
        );
      } catch (error) {
        this.logger.error(
          `Failed to enqueue document ingestion for document ${newDocument.value.publicId}`,
          error,
        );
        const failed = await this.failEnqueueSnapshot(
          knowledgeSpacePublicId,
          membership.value.knowledgeSpaceId,
          newDocument.value.publicId,
          newDocument.value.updatedAt,
          newDocument.value.title,
        );
        if (failed.isErr()) return err(failed.error);
        if (failed.value !== null) {
          return ok({
            ...documentListResponseDto,
            status: CommonDocumentStatus.Failed,
            lastUpdated: failed.value,
          });
        }
        const current =
          await this.documentQueryRepository.getDocumentListItemByPublicId(
            membership.value.knowledgeSpaceId,
            newDocument.value.publicId,
          );
        if (current.isErr())
          return err(
            new AppError(
              ErrorCode.InternalServerError,
              'Failed to get current document',
            ),
          );
        if (current.value === null)
          return err(new AppError(ErrorCode.NotFound, 'Document not found'));
        return ok(current.value);
      }
      return ok(documentListResponseDto);
    } catch (error) {
      this.logger.error('Failed to create document', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to create document',
        ),
      );
    }
  }

  async getDocumentListAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<DocumentListResponseDto>, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Viewer,
        'view documents',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      let cacheKey: string | undefined;
      try {
        const version =
          (await this.cache.get<string>(
            CacheKey.generateDocumentListVersionKey(knowledgeSpacePublicId),
          )) ?? '0';
        cacheKey = CacheKey.generateDocumentListKey(
          knowledgeSpacePublicId,
          userPublicId,
          version,
          pagination.pageNumber,
          pagination.pageSize,
        );
        const cached = await this.cache.get<string>(cacheKey);
        if (cached !== undefined && cached !== null) {
          const page = JSON.parse(
            cached,
          ) as PageResult<DocumentListResponseDto>;
          if (!page || !Array.isArray(page.items)) {
            throw new Error('Invalid cached document list');
          }
          for (const item of page.items) {
            if (typeof item.lastUpdated !== 'string') {
              throw new Error('Invalid cached document date');
            }
            item.lastUpdated = new Date(item.lastUpdated);
            if (Number.isNaN(item.lastUpdated.getTime())) {
              throw new Error('Invalid cached document date');
            }
          }
          const validation =
            await this.documentQueryRepository.validateCachedDocumentList(
              membership.value.knowledgeSpaceId,
              membership.value.userId,
              pagination,
              page,
            );
          if (validation.isOk() && validation.value) return ok(page);
        }
      } catch (error) {
        this.logger.warn('Failed to read document list cache', error);
      }

      const listResult =
        await this.documentQueryRepository.getDocumentListInKnowledgeSpace(
          membership.value.knowledgeSpaceId,
          membership.value.userId,
          pagination,
        );
      if (listResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to get document list',
          ),
        );
      }
      if (cacheKey !== undefined) {
        try {
          // Keep the version read before the query: invalidation may happen in flight.
          await this.cache.set(cacheKey, JSON.stringify(listResult.value));
        } catch (error) {
          this.logger.warn('Failed to write document list cache', error);
        }
      }
      return ok(listResult.value);
    } catch (error) {
      this.logger.error('Failed to get document list', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to get document list',
        ),
      );
    }
  }

  async searchDocumentsAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    query: SearchDocumentQueryDto,
  ): Promise<Result<PageResult<DocumentListResponseDto>, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Viewer,
        'search documents',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const searchResult =
        await this.documentQueryRepository.searchDocumentsInKnowledgeSpace(
          membership.value.knowledgeSpaceId,
          membership.value.userId,
          query.documentName,
          { pageNumber: query.pageNumber, pageSize: query.pageSize },
        );
      if (searchResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to search documents',
          ),
        );
      }
      return ok(searchResult.value);
    } catch (error) {
      this.logger.error('Failed to search documents', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to search documents',
        ),
      );
    }
  }

  async getDocumentDetailAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentPublicId: string,
  ): Promise<Result<DocumentDetailResponseDto, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Viewer,
        'view a document',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const documentData =
        await this.documentRepository.getDocumentStorageDataByPublicId(
          documentPublicId,
          membership.value.knowledgeSpaceId,
        );
      if (documentData.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to resolve document storage data',
          ),
        );
      }
      if (documentData.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Document not found'));
      }
      if (
        documentData.value.visibility === CommonDocumentVisibility.Restricted
      ) {
        const permissionResult =
          await this.documentPermissionRepository.checkDocumentPermission(
            documentData.value.id,
            membership.value.userId,
          );
        if (permissionResult.isErr()) {
          return err(
            new AppError(
              ErrorCode.InternalServerError,
              'Failed to check document permission',
            ),
          );
        }
        if (permissionResult.value === null) {
          return err(new AppError(ErrorCode.Forbidden, 'Access denied'));
        }
      }

      const detailResult = await this.documentQueryRepository.getDocumentDetail(
        membership.value.knowledgeSpaceId,
        documentPublicId,
      );
      if (detailResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to get document detail',
          ),
        );
      }
      if (detailResult.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Document not found'));
      }
      return ok(detailResult.value);
    } catch (error) {
      this.logger.error('Failed to get document detail', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to get document detail',
        ),
      );
    }
  }

  async updateDocumentAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentPublicId: string,
    documentUpdateRequestDto: DocumentUpdateRequestDto,
  ): Promise<Result<DocumentListResponseDto, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Editor,
        'update document',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const documentData =
        await this.documentRepository.getDocumentStorageDataByPublicId(
          documentPublicId,
          membership.value.knowledgeSpaceId,
        );
      if (documentData.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to resolve document storage data',
          ),
        );
      }
      if (documentData.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Document not found'));
      }

      let categoryId: number | undefined;
      if (documentUpdateRequestDto.categoryPublicId) {
        const categoryResult =
          await this.categoryRepository.getCategoryIdByPublicId(
            documentUpdateRequestDto.categoryPublicId,
            membership.value.knowledgeSpaceId,
          );
        if (categoryResult.isErr()) {
          return err(
            new AppError(
              ErrorCode.InternalServerError,
              'Failed to resolve category',
            ),
          );
        }
        if (categoryResult.value === null) {
          return err(new AppError(ErrorCode.NotFound, 'Category not found'));
        }
        categoryId = categoryResult.value.id;
      }

      // Replacing the file works like providing `content`, but the new bytes live in
      // R2 rather than inline text; the new key must already have been uploaded via
      // getUploadUrlAsync, and `name` must carry its extension to resolve the type.
      let fileReplacement:
        | {
            storagePath: string;
            fileSize: number;
            fileType: CommonDocumentType;
          }
        | undefined;
      if (documentUpdateRequestDto.storageKey) {
        if (!documentUpdateRequestDto.name) {
          return err(
            new AppError(
              ErrorCode.BadRequest,
              'name (with the new file extension) is required when replacing the file',
            ),
          );
        }
        if (
          !documentUpdateRequestDto.storageKey.startsWith(
            this.storageKeyPrefix(knowledgeSpacePublicId),
          )
        ) {
          return err(
            new AppError(
              ErrorCode.BadRequest,
              'Storage key does not belong to this knowledge space',
            ),
          );
        }
        const fileType = this.resolveFileType(documentUpdateRequestDto.name);
        if (fileType === null) {
          return err(
            new AppError(
              ErrorCode.BadRequest,
              'Unsupported file type. Only PDF, DOCX, TXT and MD are accepted',
            ),
          );
        }
        const objectMetadata = await this.fileStorage.GetObjectMetadata(
          documentUpdateRequestDto.storageKey,
        );
        if (objectMetadata.isErr()) {
          return err(objectMetadata.error);
        }
        if (objectMetadata.value === null) {
          return err(
            new AppError(
              ErrorCode.BadRequest,
              'No uploaded file was found for the given storage key',
            ),
          );
        }
        fileReplacement = {
          storagePath: documentUpdateRequestDto.storageKey,
          fileSize: objectMetadata.value.contentLength,
          fileType,
        };
      }

      const updateParams: DocumentUpdateParams = {
        title: documentUpdateRequestDto.name ?? undefined,
        description: documentUpdateRequestDto.description,
        content: documentUpdateRequestDto.content,
        categoryId,
        visibility: documentUpdateRequestDto.visibility ?? undefined,
        storagePath: fileReplacement?.storagePath,
        fileSize: fileReplacement?.fileSize,
        fileType: fileReplacement?.fileType,
      };
      const validationResult = Document.validateUpdate(updateParams);
      if (validationResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.BadRequest,
            `Failed to update document. ${validationResult.error.message}`,
          ),
        );
      }

      // Providing content or a new file re-triggers ingestion; addChunks deletes the
      // document's old chunks before inserting the new ones, so there is no separate
      // cleanup step here.
      const needsReingestion =
        documentUpdateRequestDto.content !== undefined ||
        fileReplacement !== undefined;
      const updateResult = await this.documentRepository.updateDocument(
        documentData.value.id,
        {
          ...updateParams,
          status: needsReingestion
            ? CommonDocumentStatus.Processing
            : undefined,
        },
      );
      if (updateResult.isErr()) {
        if (updateResult.error instanceof AppError)
          return err(updateResult.error);
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to update document',
          ),
        );
      }

      await this.invalidateDocumentList(
        knowledgeSpacePublicId,
        membership.value.knowledgeSpaceId,
      );

      if (updateResult.value.status === CommonDocumentStatus.Processing) {
        try {
          await this.ingestionQueue.add(
            EventName.IngestionDocument,
            {
              documentPublicId,
              expectedUpdatedAt: updateResult.value.updatedAt.toISOString(),
            },
            {
              attempts: 3, // retry up to 3 times in case of failure
            },
          );
        } catch (error) {
          this.logger.error(
            `Failed to enqueue document ingestion for document ${documentPublicId}`,
            error,
          );
          const failed = await this.failEnqueueSnapshot(
            knowledgeSpacePublicId,
            membership.value.knowledgeSpaceId,
            documentPublicId,
            updateResult.value.updatedAt,
            documentUpdateRequestDto.name ?? documentData.value.fileName,
          );
          if (failed.isErr()) return err(failed.error);
        }
      }

      // Best-effort: the DB already points at the new file, so a failed cleanup of
      // the old object only wastes storage, it doesn't affect the document's data.
      if (
        fileReplacement &&
        fileReplacement.storagePath !== documentData.value.storagePath
      ) {
        const canDelete = await this.documentRepository.canDeleteStorageObject(
          documentData.value.storagePath,
        );
        if (canDelete.isOk() && canDelete.value) {
          const deleteResult = await this.fileStorage.DeleteObject(
            documentData.value.storagePath,
          );
          if (deleteResult.isErr()) {
            this.logger.error(
              `Failed to delete replaced file ${documentData.value.storagePath} for document ${documentPublicId}`,
              deleteResult.error,
            );
          }
        }
      }
      const updatedItem =
        await this.documentQueryRepository.getDocumentListItemByPublicId(
          membership.value.knowledgeSpaceId,
          documentPublicId,
        );
      if (updatedItem.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to get updated document',
          ),
        );
      }
      if (updatedItem.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Document not found'));
      }
      return ok(updatedItem.value);
    } catch (error) {
      this.logger.error('Failed to update document', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to update document',
        ),
      );
    }
  }

  /**
   * The presigned URL leaves the content type unsigned, so the extension is the only
   * part of the upload the client cannot silently disagree with the server about.
   */
  private resolveFileType(fileName: string): CommonDocumentType | null {
    const parts = fileName.toLowerCase().split('.');
    if (parts.length < 2) {
      return null;
    }

    return EXTENSION_TO_FILE_TYPE[parts[parts.length - 1]] ?? null;
  }

  private async failEnqueueSnapshot(
    knowledgeSpacePublicId: string,
    knowledgeSpaceId: number,
    documentPublicId: string,
    expectedUpdatedAt: Date,
    fileName: string,
  ): Promise<Result<Date | null, AppError>> {
    const transition = await this.documentRepository.transitionDocumentStatus(
      documentPublicId,
      knowledgeSpaceId,
      CommonDocumentStatus.Processing,
      expectedUpdatedAt,
      CommonDocumentStatus.Failed,
    );
    if (transition.isErr()) {
      this.logger.error(
        'Failed to persist document enqueue failure',
        transition.error,
      );
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to persist document enqueue failure',
        ),
      );
    }
    await this.invalidateDocumentList(knowledgeSpacePublicId, knowledgeSpaceId);
    if (transition.value !== null) {
      await this.notifyFailed(knowledgeSpaceId, {
        documentPublicId,
        knowledgeSpacePublicId,
        fileName,
        status: 'Failed',
        updatedAt: transition.value.toISOString(),
      });
    }
    return ok(transition.value);
  }

  private async notifyFailed(
    knowledgeSpaceId: number,
    payload: DocumentStatusPayload,
  ): Promise<void> {
    try {
      await this.realtimeNotifier.notifyDocumentStatus(
        knowledgeSpaceId,
        payload,
      );
    } catch (error) {
      this.logger.warn('Failed to notify document enqueue failure', error);
    }
  }

  private async invalidateDocumentList(
    knowledgeSpacePublicId: string,
    knowledgeSpaceId: number,
  ): Promise<void> {
    try {
      await this.cache.set(
        CacheKey.generateDocumentListVersionKey(knowledgeSpacePublicId),
        randomUUID(),
        0,
      );
    } catch (error) {
      this.logger.warn('Failed to invalidate document list cache', error);
    }
    try {
      await this.cache.set(
        CacheKey.generateSimilarChunksVersionKey(knowledgeSpaceId),
        randomUUID(),
        0,
      );
    } catch (error) {
      this.logger.warn('Failed to invalidate similar chunks cache', error);
    }
  }

  private storageKeyPrefix(knowledgeSpacePublicId: string): string {
    return `documents/${knowledgeSpacePublicId}/`;
  }

  /** A random key keeps two uploads of the same file name from overwriting each other. */
  private buildStorageKey(
    knowledgeSpacePublicId: string,
    fileName: string,
  ): string {
    const extension = fileName.toLowerCase().split('.').pop();

    return `${this.storageKeyPrefix(knowledgeSpacePublicId)}${randomUUID()}.${extension}`;
  }
}
