import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DocumentStatusPayload } from './realtime-notifier.interface';

@Injectable()
export class DocumentStatusAudienceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getRecipientUserIds(
    knowledgeSpaceId: number,
    payload: DocumentStatusPayload,
  ): Promise<number[]> {
    // A single statement gives document version, membership and permissions
    // the same DB snapshot; stale terminal notifications have no audience.
    const recipients = await this.prisma.$queryRaw<{ userId: number }[]>`
      SELECT uw.user_id AS "userId"
      FROM document d
      JOIN knowledge_space ks ON ks.id = d.knowledge_space_id
      JOIN user_workspace uw ON uw.knowledge_space_id = d.knowledge_space_id
      WHERE d.public_id = ${payload.documentPublicId}
        AND d.knowledge_space_id = ${knowledgeSpaceId}
        AND ks.public_id = ${payload.knowledgeSpacePublicId}
        AND d.is_deleted = false
        AND d.status::text = ${payload.status}
        AND d.updated_at = ${new Date(payload.updatedAt)}
        AND (
          d.visibility = 'Public'
          OR (d.visibility = 'Restricted' AND EXISTS (
            SELECT 1 FROM document_permission dp
            WHERE dp.document_id = d.id AND dp.user_id = uw.user_id
          ))
        )
    `;
    return recipients.map((recipient) => recipient.userId);
  }
}
