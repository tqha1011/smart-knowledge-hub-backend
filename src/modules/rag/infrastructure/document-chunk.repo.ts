import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  DocumentChunkAddData,
  IDocumentChunkRepository,
} from '../domain/repositories/document-chunk.repo.interface';

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
}
