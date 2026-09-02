import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { CommonPermissionType } from 'src/shared/domain/enum';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  DocumentPermissionRequest,
  IDocumentPermissionRepository,
} from '../domain/repositories/document-permission.repo.interface';
import { toDomainPermission } from './document-permission.mapper';

@Injectable()
export class DocumentPermissionRepository implements IDocumentPermissionRepository {
  private readonly logger = new Logger(DocumentPermissionRepository.name);
  constructor(private readonly prismaService: PrismaService) {}
  async updateDocumentPermission(
    documentId: number,
    permissionRequest: DocumentPermissionRequest[],
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.$transaction(async (tx) => {
        await tx.documentPermission.deleteMany({
          where: { documentId },
        });
        if (permissionRequest.length > 0) {
          await tx.documentPermission.createMany({
            data: permissionRequest.map((req) => ({
              userId: req.userId,
              documentId: req.documentId,
              permission: req.permission,
            })),
            skipDuplicates: true,
          });
        }
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to update document permission', error);
      return err(new Error('Failed to update document permission'));
    }
  }

  async addDocumentPermission(
    permissionRequest: DocumentPermissionRequest[],
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.documentPermission.createMany({
        data: permissionRequest.map((req) => ({
          userId: req.userId,
          documentId: req.documentId,
          permission: req.permission,
        })),
        skipDuplicates: true, // Skip if the permission already exists
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `Failed to add document permission for document ${error}`,
      );
      return err(new Error('Failed to add document permission'));
    }
  }
  async checkDocumentPermission(
    documentId: number,
    userId: number,
  ): Promise<Result<CommonPermissionType | null, Error>> {
    try {
      const permission = await this.prismaService.documentPermission.findUnique(
        {
          where: {
            unique_document_permission_per_user: {
              documentId: documentId,
              userId: userId,
            },
          },
          select: {
            permission: true,
          },
        },
      );
      if (!permission) {
        return ok(null);
      }
      return ok(toDomainPermission(permission.permission));
    } catch (error) {
      this.logger.error(
        `Failed to check document permission for documentId: ${documentId}, userId: ${userId}, error: ${error}`,
      );
      return err(
        new Error(
          `Failed to check document permission for documentId: ${documentId}, userId: ${userId}`,
        ),
      );
    }
  }
}
