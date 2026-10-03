import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { KnowledgeSpaceRepository } from './knowledgeSpace.repo';

describe('KnowledgeSpaceRepository.getKnowledgeSpaceIdsForUser', () => {
  it('returns the internal ids of every knowledge space the user belongs to', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ knowledgeSpaceId: 7 }, { knowledgeSpaceId: 12 }]);
    const prismaService = {
      userWorkspace: { findMany },
    } as unknown as PrismaService;
    const repository = new KnowledgeSpaceRepository(prismaService);

    const result = await repository.getKnowledgeSpaceIdsForUser(3);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([7, 12]);
    }
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 3 },
      select: { knowledgeSpaceId: true },
    });
  });

  it('wraps a Prisma error as a Result error instead of throwing', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('connection lost'));
    const prismaService = {
      userWorkspace: { findMany },
    } as unknown as PrismaService;
    const repository = new KnowledgeSpaceRepository(prismaService);

    const result = await repository.getKnowledgeSpaceIdsForUser(3);

    expect(result.isErr()).toBe(true);
  });
});

describe('KnowledgeSpaceRepository.getUserDataInKnowledgeSpace', () => {
  it('uses a unique tie breaker when paginating members with equal join times', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prismaService = {
      userWorkspace: { findMany, count },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    } as unknown as PrismaService;
    const repository = new KnowledgeSpaceRepository(prismaService);

    const result = await repository.getUserDataInKnowledgeSpace(7, {
      pageNumber: 2,
      pageSize: 100,
    });

    expect(result.isOk()).toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 100,
        take: 100,
      }),
    );
  });
});
