import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { authorizeMembership } from 'src/modules/knowledge-space/application/services/authorizeMembership';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { CacheKey } from 'src/shared/domain/cacheKey';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { IDocumentPermissionRepository } from '../../domain/repositories/document-permission.repo.interface';
import { IDocumentRepository } from '../../domain/repositories/document.repo.interface';
import { DocumentPermissionRequestDto } from '../dtos/document.request.dto';
import { IDocumentPermissionService } from '../interfaces/document-permission.service.interface';

@Injectable()
export class DocumentPermissionService implements IDocumentPermissionService {
  private readonly logger = new Logger(DocumentPermissionService.name);
  constructor(
    private readonly documentPermissionRepository: IDocumentPermissionRepository,
    private readonly userRepository: IUserRepository,
    private readonly documentRepository: IDocumentRepository,
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
    private readonly cache: IApplicationCache,
  ) {}
  async updateDocumentPermissionAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentPublicId: string,
    permissionRequest: DocumentPermissionRequestDto[],
  ): Promise<Result<undefined, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Editor,
        'manage document permissions',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const documentIdResult =
        await this.documentRepository.getDocumentIdByPublicId(
          documentPublicId,
          membership.value.knowledgeSpaceId,
        );
      if (documentIdResult.isErr()) {
        this.logger.error(
          `Failed to get document ID for document ${documentPublicId}, error: ${documentIdResult.error}`,
        );
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to resolve document',
          ),
        );
      }
      if (documentIdResult.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Document not found'));
      }
      const documentId = documentIdResult.value;

      const userPublicIds = permissionRequest.map((req) => req.userPublicId);
      const userIdsResult =
        await this.userRepository.GetUserIdsByPublicIds(userPublicIds);
      if (userIdsResult.isErr()) {
        this.logger.error(
          `Failed to get user IDs for document ${documentPublicId}, error: ${userIdsResult.error}`,
        );
        return err(
          new AppError(ErrorCode.InternalServerError, 'Failed to get user IDs'),
        );
      }

      // Matched by publicId, not by index: the repo result can be shorter than
      // (or differently ordered than) userPublicIds when some users don't exist.
      const userIdByPublicId = new Map(
        userIdsResult.value.map((user) => [user.publicId, user.id]),
      );
      const missingPublicIds = userPublicIds.filter(
        (publicId) => !userIdByPublicId.has(publicId),
      );
      if (missingPublicIds.length > 0) {
        return err(
          new AppError(
            ErrorCode.NotFound,
            `User(s) not found: ${missingPublicIds.join(', ')}`,
          ),
        );
      }

      const permissionRequests = permissionRequest.map((req) => ({
        // Safe: every userPublicId was just confirmed present in the map above.
        userId: userIdByPublicId.get(req.userPublicId)!,
        documentId,
        permission: req.permission,
      }));

      const addResult =
        await this.documentPermissionRepository.updateDocumentPermission(
          documentId,
          permissionRequests,
        );
      if (addResult.isErr()) {
        if (addResult.error instanceof AppError) return err(addResult.error);
        this.logger.error(
          `Failed to add document permission for document ${documentPublicId}, error: ${addResult.error}`,
        );
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to add document permission',
          ),
        );
      }
      await this.invalidateDocumentCaches(
        knowledgeSpacePublicId,
        membership.value.knowledgeSpaceId,
      );
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `Failed to add document permission for document ${documentPublicId}, error: ${error}`,
      );
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to add document permission',
        ),
      );
    }
  }

  async addDocumentPermissionAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentPublicId: string,
    permissionRequest: DocumentPermissionRequestDto[],
  ): Promise<Result<undefined, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Editor,
        'manage document permissions',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const documentIdResult =
        await this.documentRepository.getDocumentIdByPublicId(
          documentPublicId,
          membership.value.knowledgeSpaceId,
        );
      if (documentIdResult.isErr()) {
        this.logger.error(
          `Failed to get document ID for document ${documentPublicId}, error: ${documentIdResult.error}`,
        );
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to resolve document',
          ),
        );
      }
      if (documentIdResult.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Document not found'));
      }
      const documentId = documentIdResult.value;

      const userPublicIds = permissionRequest.map((req) => req.userPublicId);
      const userIdsResult =
        await this.userRepository.GetUserIdsByPublicIds(userPublicIds);
      if (userIdsResult.isErr()) {
        this.logger.error(
          `Failed to get user IDs for document ${documentPublicId}, error: ${userIdsResult.error}`,
        );
        return err(
          new AppError(ErrorCode.InternalServerError, 'Failed to get user IDs'),
        );
      }

      // Matched by publicId, not by index: the repo result can be shorter than
      // (or differently ordered than) userPublicIds when some users don't exist.
      const userIdByPublicId = new Map(
        userIdsResult.value.map((user) => [user.publicId, user.id]),
      );
      const missingPublicIds = userPublicIds.filter(
        (publicId) => !userIdByPublicId.has(publicId),
      );
      if (missingPublicIds.length > 0) {
        return err(
          new AppError(
            ErrorCode.NotFound,
            `User(s) not found: ${missingPublicIds.join(', ')}`,
          ),
        );
      }

      const permissionRequests = permissionRequest.map((req) => ({
        // Safe: every userPublicId was just confirmed present in the map above.
        userId: userIdByPublicId.get(req.userPublicId)!,
        documentId,
        permission: req.permission,
      }));

      const addResult =
        await this.documentPermissionRepository.addDocumentPermission(
          permissionRequests,
        );
      if (addResult.isErr()) {
        if (addResult.error instanceof AppError) return err(addResult.error);
        this.logger.error(
          `Failed to add document permission for document ${documentPublicId}, error: ${addResult.error}`,
        );
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to add document permission',
          ),
        );
      }
      await this.invalidateDocumentCaches(
        knowledgeSpacePublicId,
        membership.value.knowledgeSpaceId,
      );
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `Failed to add document permission for document ${documentPublicId}, error: ${error}`,
      );
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to add document permission',
        ),
      );
    }
  }

  private async invalidateDocumentCaches(
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
}
