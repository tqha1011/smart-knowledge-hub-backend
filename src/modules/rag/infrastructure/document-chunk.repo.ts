import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  DocumentChunkAddData,
  IDocumentChunkRepository,
  SimilarChunk,
} from '../domain/repositories/document-chunk.repo.interface';

type SimilarChunkRow = {
  chunk_id: number;
  document_id: number;
  document_public_id: string;
  document_title: string;
  content: string;
  score: number;
};

@Injectable()
export class DocumentChunkRepository implements IDocumentChunkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async addChunks(
    data: DocumentChunkAddData,
  ): Promise<Result<undefined, Error>> {
    try {
      const rows = data.embeddingResult.map((chunk) => {
        const vectorLiteral = `[${chunk.embedding.join(',')}]`;
        return Prisma.sql`(${data.documentId}, ${data.knowledgeSpaceId}, ${chunk.chunkIndex}, ${chunk.content}, ${chunk.tokens}, ${vectorLiteral}::vector, now(), now())`;
      });

      // Delete-then-insert in the same transaction so a BullMQ retry that
      // re-runs this after a partial success doesn't collide with the
      // unique (document_id, chunk_index) constraint from the prior attempt.
      await this.prisma.$transaction([
        this.prisma
          .$executeRaw`DELETE FROM document_chunk WHERE document_id = ${data.documentId}`,
        this.prisma.$executeRaw`
          INSERT INTO document_chunk
            (document_id, knowledge_space_id, chunk_index, content_chunk, token_count, embedding, created_at, updated_at)
          VALUES ${Prisma.join(rows)}
        `,
      ]);

      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to add document chunks: ${error}`));
    }
  }

  async searchSimilarChunks(
    knowledgeSpaceId: number,
    userId: number,
    queryEmbedding: number[],
    topK: number,
  ): Promise<Result<SimilarChunk[], Error>> {
    try {
      const vectorLiteral = `[${queryEmbedding.join(',')}]`;
      const rows = await this.prisma.$queryRaw<SimilarChunkRow[]>(Prisma.sql`
        SELECT
          dc.id AS chunk_id,
          dc.document_id AS document_id,
          d.public_id AS document_public_id,
          d.title AS document_title,
          dc.content_chunk AS content,
          1 - (dc.embedding <=> ${vectorLiteral}::vector) AS score
        FROM document_chunk dc
        JOIN document d ON d.id = dc.document_id
        WHERE dc.knowledge_space_id = ${knowledgeSpaceId}
          AND d.status = 'Ready'
          AND (
            d.visibility = 'Public'
            OR EXISTS (
              SELECT 1 FROM document_permission dp
              WHERE dp.document_id = d.id AND dp.user_id = ${userId}
            )
          )
        ORDER BY dc.embedding <=> ${vectorLiteral}::vector
        LIMIT ${topK}
      `);

      return ok(
        rows.map((row) => ({
          chunkId: row.chunk_id,
          documentId: row.document_id,
          documentPublicId: row.document_public_id,
          documentTitle: row.document_title,
          content: row.content,
          score: row.score,
        })),
      );
    } catch (error) {
      return err(new Error(`Failed to search similar chunks: ${error}`));
    }
  }
}
