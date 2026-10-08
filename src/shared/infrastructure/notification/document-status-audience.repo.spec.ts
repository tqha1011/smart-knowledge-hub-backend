import { PrismaService } from '../database/prisma.service';
import { DocumentStatusAudienceRepository } from './document-status-audience.repo';

const payload = {
  documentPublicId: 'doc',
  knowledgeSpacePublicId: 'space',
  fileName: 'Guide.txt',
  status: 'Ready' as const,
  updatedAt: '2026-10-08T12:00:00.000Z',
};

describe('DocumentStatusAudienceRepository', () => {
  it('returns internal recipient IDs from one parameterized snapshot query', async () => {
    const query = jest.fn().mockResolvedValue([{ userId: 7 }, { userId: 8 }]);
    const repo = new DocumentStatusAudienceRepository({
      $queryRaw: query,
    } as unknown as PrismaService);
    expect(await repo.getRecipientUserIds(3, payload)).toEqual([7, 8]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, ...parameters] = query.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(sql.join('?')).toContain('EXISTS');
    expect(parameters).toEqual([
      payload.documentPublicId,
      3,
      payload.knowledgeSpacePublicId,
      payload.status,
      new Date(payload.updatedAt),
    ]);
  });

  it('does not hide a failed permission query', async () => {
    const query = jest.fn().mockRejectedValue(new Error('DB unavailable'));
    const repo = new DocumentStatusAudienceRepository({
      $queryRaw: query,
    } as unknown as PrismaService);
    await expect(repo.getRecipientUserIds(3, payload)).rejects.toThrow(
      'DB unavailable',
    );
  });
});
