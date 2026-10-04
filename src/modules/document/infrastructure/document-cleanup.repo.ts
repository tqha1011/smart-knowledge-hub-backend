import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { databaseNow, nextDocumentVersion } from './document-persistence';

export type DocumentPurgePayload = {
  documentPublicId: string;
  deletedAt: string;
};
export type DocumentPurgeSnapshot = {
  id: number;
  publicId: string;
  storagePath: string;
  knowledgeSpaceId: number;
  knowledgeSpacePublicId: string;
};

@Injectable()
export class DocumentCleanupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async scanExpired(
    cursor: number,
    limit: number,
  ): Promise<{ id: number; publicId: string; deletedAt: Date }[]> {
    return this.prisma
      .$queryRaw`SELECT id, public_id AS "publicId", deleted_at AS "deletedAt" FROM document
      WHERE id > ${cursor} AND is_deleted = true AND purge_after <= clock_timestamp() AND purged_at IS NULL
      ORDER BY id ASC LIMIT ${limit}`;
  }

  async claimPurge(
    payload: DocumentPurgePayload,
  ): Promise<DocumentPurgeSnapshot | null> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM document
        WHERE public_id = ${payload.documentPublicId} AND is_deleted = true AND deleted_at = ${new Date(payload.deletedAt)}
          AND purge_after <= clock_timestamp() AND purged_at IS NULL FOR UPDATE`;
      if (!rows.length) return null;
      const document = await tx.document.findUniqueOrThrow({
        where: { id: rows[0].id },
        include: { workspace: { select: { publicId: true } } },
      });
      if (!document.purgeStartedAt) {
        const now = await databaseNow(tx);
        await tx.document.update({
          where: { id: document.id },
          data: {
            purgeStartedAt: now,
            updatedAt: nextDocumentVersion(document.updatedAt, now),
          },
        });
      }
      return {
        id: document.id,
        publicId: document.publicId,
        storagePath: document.storagePath,
        knowledgeSpaceId: document.knowledgeSpaceId,
        knowledgeSpacePublicId: document.workspace.publicId,
      };
    });
  }

  async canDeleteStorageObject(key: string): Promise<boolean> {
    // Keys are permanently reserved by create/replace. Existing shared owners may
    // restore only while still before their deadline; both states protect the file.
    const [row] = await this.prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM document
      WHERE storage_path = ${key} AND (is_deleted = false OR (purged_at IS NULL AND purge_after > clock_timestamp()))`;
    return Number(row.count) === 0;
  }

  async finalizePurge(payload: DocumentPurgePayload): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: number; updated_at: Date }[]
      >`SELECT id, updated_at FROM document
        WHERE public_id = ${payload.documentPublicId} AND is_deleted = true AND deleted_at = ${new Date(payload.deletedAt)}
          AND purge_started_at IS NOT NULL AND purged_at IS NULL FOR UPDATE`;
      if (!rows.length) return false;
      const document = rows[0];
      await tx.documentChunk.deleteMany({ where: { documentId: document.id } });
      await tx.documentPermission.deleteMany({
        where: { documentId: document.id },
      });
      const now = await databaseNow(tx);
      await tx.document.update({
        where: { id: document.id },
        data: {
          content: null,
          purgedAt: now,
          updatedAt: nextDocumentVersion(document.updated_at, now),
        },
      });
      return true;
    });
  }
}
