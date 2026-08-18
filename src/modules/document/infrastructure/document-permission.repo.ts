import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { CommonPermissionType } from 'src/shared/domain/enum';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { IDocumentPermissionRepository } from '../domain/repositories/document-permission.repo.interface';
import { toDomainPermission } from './document-permission.mapper';

@Injectable()
export class DocumentPermissionRepository implements IDocumentPermissionRepository {
  private readonly logger = new Logger(DocumentPermissionRepository.name);
  constructor(private readonly prismaService: PrismaService) {}
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
