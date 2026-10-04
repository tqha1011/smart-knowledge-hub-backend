import {
  databaseNow,
  nextDocumentVersion,
} from 'src/modules/document/infrastructure/document-persistence';
import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  DocumentChunkAddData,
  IDocumentChunkRepository,
  SimilarChunk,
  SimilarChunkScopes,
} from '../domain/repositories/document-chunk.repo.interface';

type SimilarChunkRow = {
  chunk_id: number;
  document_id: number;
  document_public_id: string;
  document_title: string;
  content: string;
  score: number;
  visibility: 'Public' | 'Restricted';
};

@Injectable()
export class DocumentChunkRepository implements IDocumentChunkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async validateSimilarChunks(
    spaceId: number,
    userId: number,
    chunks: SimilarChunk[],
  ): Promise<Result<SimilarChunk[], Error>> {
    if (!chunks.length) return ok([]);
    try {
      const current = await this.prisma.documentChunk.findMany({
        where: {
          id: { in: chunks.map((c) => c.chunkId) },
          knowledgeSpaceId: spaceId,
          document: {
            knowledgeSpaceId: spaceId,
            isDeleted: false,
            status: 'Ready',
            OR: [
              { visibility: 'Public' },
              {
                visibility: 'Restricted',
                documentPermissions: { some: { userId } },
              },
            ],
          },
        },
        select: {
          id: true,
          documentId: true,
          contentChunk: true,
          document: {
            select: { publicId: true, title: true, visibility: true },
          },
        },
      });
      const byId = new Map(current.map((c) => [c.id, c]));
      return ok(
        chunks.flatMap((c) => {
          const fresh = byId.get(c.chunkId);
          if (
            !fresh ||
            fresh.documentId !== c.documentId ||
            fresh.document.publicId !== c.documentPublicId ||
            fresh.contentChunk !== c.content ||
            fresh.document.visibility !== c.visibility
          )
            return [];
          return [
            {
              ...c,
              documentTitle: fresh.document.title,
              content: fresh.contentChunk,
            },
          ];
        }),
      );
    } catch {
      return err(new Error('Failed to validate retrieved chunks'));
    }
  }

  async addChunks(
    data: DocumentChunkAddData,
  ): Promise<Result<Date | null, Error>> {
    try {
      const rows = data.embeddingResult.map((chunk) => {
        const vectorLiteral = `[${chunk.embedding.join(',')}]`;
        return Prisma.sql`(${data.documentId}, ${data.knowledgeSpaceId}, ${chunk.chunkIndex}, ${chunk.content}, ${chunk.tokens}, ${vectorLiteral}::vector, now(), now())`;
      });

      const committedAt = await this.prisma.$transaction(async (tx) => {
        const documents = await tx.$queryRaw<
          { updated_at: Date; status: string; is_deleted: boolean }[]
        >`SELECT updated_at, status, is_deleted FROM document WHERE id = ${data.documentId} AND knowledge_space_id = ${data.knowledgeSpaceId} FOR UPDATE`;
        const document = documents[0];
        if (
          !document ||
          document.is_deleted ||
          document.status !== 'Processing' ||
          document.updated_at.getTime() !== data.expectedUpdatedAt.getTime()
        )
          return null;
        await tx.$executeRaw`DELETE FROM document_chunk WHERE document_id = ${data.documentId}`;
        if (rows.length)
          await tx.$executeRaw`
          INSERT INTO document_chunk
            (document_id, knowledge_space_id, chunk_index, content_chunk, token_count, embedding, created_at, updated_at)
          VALUES ${Prisma.join(rows)}
        `;
        const updatedAt = nextDocumentVersion(
          document.updated_at,
          await databaseNow(tx),
        );
        await tx.document.update({
          where: { id: data.documentId },
          data: { status: 'Ready', updatedAt },
        });
        return updatedAt;
      });
      return ok(committedAt);
    } catch (error) {
      return err(new Error(`Failed to add document chunks: ${error}`));
    }
  }

  async searchSimilarChunks(
    knowledgeSpaceId: number,
    userId: number,
    queryEmbedding: number[],
    topK: number,
    scopes: SimilarChunkScopes,
  ): Promise<Result<SimilarChunk[], Error>> {
    try {
      if (!scopes.public && !scopes.restricted) return ok([]);
      const vectorLiteral = `[${queryEmbedding.join(',')}]`;
      const queries: Prisma.Sql[] = [];
      if (scopes.public) {
        queries.push(Prisma.sql`
          SELECT
            dc.id AS chunk_id,
            dc.document_id AS document_id,
            d.public_id AS document_public_id,
            d.title AS document_title,
            dc.content_chunk AS content,
            'Public' AS visibility,
            1 - (dc.embedding <=> ${vectorLiteral}::vector) AS score
          FROM document_chunk dc
          JOIN document d ON d.id = dc.document_id
          WHERE dc.knowledge_space_id = ${knowledgeSpaceId}
            AND d.is_deleted = false
            AND d.status = 'Ready'
            AND d.visibility = 'Public'
          ORDER BY dc.embedding <=> ${vectorLiteral}::vector, dc.id
          LIMIT ${topK}
        `);
      }
      if (scopes.restricted) {
        queries.push(Prisma.sql`
          SELECT
            dc.id AS chunk_id,
            dc.document_id AS document_id,
            d.public_id AS document_public_id,
            d.title AS document_title,
            dc.content_chunk AS content,
            'Restricted' AS visibility,
            1 - (dc.embedding <=> ${vectorLiteral}::vector) AS score
          FROM document_chunk dc
          JOIN document d ON d.id = dc.document_id
          WHERE dc.knowledge_space_id = ${knowledgeSpaceId}
            AND d.is_deleted = false
            AND d.status = 'Ready'
            AND d.visibility = 'Restricted'
            AND EXISTS (
              SELECT 1 FROM document_permission dp
              WHERE dp.document_id = d.id AND dp.user_id = ${userId}
            )
          ORDER BY dc.embedding <=> ${vectorLiteral}::vector, dc.id
          LIMIT ${topK}
        `);
      }
      const rows = await this.prisma.$queryRaw<SimilarChunkRow[]>(
        Prisma.join(
          queries.map((query) => Prisma.sql`(${query})`),
          ' UNION ALL ',
        ),
      );

      return ok(
        rows.map((row) => ({
          chunkId: row.chunk_id,
          documentId: row.document_id,
          documentPublicId: row.document_public_id,
          documentTitle: row.document_title,
          content: row.content,
          score: row.score,
          visibility: row.visibility,
        })),
      );
    } catch (error) {
      return err(new Error(`Failed to search similar chunks: ${error}`));
    }
  }
}
