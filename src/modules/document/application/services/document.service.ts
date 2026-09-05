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
} from '../dtos/document.request.dto';
import {
  DocumentDetailResponseDto,
  DocumentListResponseDto,
  DocumentUploadUrlResponseDto,
} from '../dtos/document.response.dto';
import { IDocumentService } from '../interfaces/document.service.interface';

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
  ) {}

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
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to add document to repository',
          ),
        );
      }
      // push to ingestion queue for further processing (e.g., text extraction, indexing, etc.)
      try {
        await this.ingestionQueue.add(
          EventName.IngestionDocument,
          {
            documentPublicId: newDocument.value.publicId,
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
      }
      const documentListResponseDto: DocumentListResponseDto = {
        publicId: newDocument.value.publicId,
        title: newDocument.value.title,
        fileType: newDocument.value.fileType,
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

      const listResult =
        await this.documentQueryRepository.getDocumentListInKnowledgeSpace(
          membership.value.knowledgeSpaceId,
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

      const updateParams: DocumentUpdateParams = {
        title: documentUpdateRequestDto.name ?? undefined,
        description: documentUpdateRequestDto.description,
        content: documentUpdateRequestDto.content,
        categoryId,
        visibility: documentUpdateRequestDto.visibility ?? undefined,
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

      // Providing content re-triggers ingestion; addChunks deletes the document's old
      // chunks before inserting the new ones, so there is no separate cleanup step here.
      const contentProvided = documentUpdateRequestDto.content !== undefined;
      const updateResult = await this.documentRepository.updateDocument(
        documentData.value.id,
        {
          ...updateParams,
          status: contentProvided ? CommonDocumentStatus.Processing : undefined,
        },
      );
      if (updateResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to update document',
          ),
        );
      }

      if (contentProvided) {
        try {
          await this.ingestionQueue.add(
            EventName.IngestionDocument,
            { documentPublicId },
            {
              attempts: 3, // retry up to 3 times in case of failure
            },
          );
        } catch (error) {
          this.logger.error(
            `Failed to enqueue document ingestion for document ${documentPublicId}`,
            error,
          );
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
