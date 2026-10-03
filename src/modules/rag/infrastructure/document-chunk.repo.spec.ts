import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { DocumentChunkRepository } from './document-chunk.repo';

describe('DocumentChunkRepository.searchSimilarChunks', () => {
  const queryRaw = jest
    .fn<Promise<unknown[]>, [Prisma.Sql]>()
    .mockResolvedValue([]);
  const repository = new DocumentChunkRepository({
    $queryRaw: queryRaw,
  } as unknown as PrismaService);

  beforeEach(() => queryRaw.mockClear());

  it('retrieves up to topK per visibility in one database call', async () => {
    await repository.searchSimilarChunks(7, 12, [0.1, 0.2], 5, {
      public: true,
      restricted: true,
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const query = queryRaw.mock.calls[0][0];
    expect(query.sql).toContain('UNION ALL');
    expect(query.sql.match(/LIMIT/g)).toHaveLength(2);
    expect(query.sql).toContain("d.visibility = 'Public'");
    expect(query.sql).toContain("d.visibility = 'Restricted'");
    expect(query.sql).toContain('dp.user_id');
    expect(query.values).toContain(12);
  });

  it('queries only Public documents when the Restricted cache hits', async () => {
    await repository.searchSimilarChunks(7, 12, [0.1, 0.2], 5, {
      public: true,
      restricted: false,
    });

    const query = queryRaw.mock.calls[0][0];
    expect(query.sql).not.toContain('document_permission');
    expect(query.sql).not.toContain("d.visibility = 'Restricted'");
  });
});
