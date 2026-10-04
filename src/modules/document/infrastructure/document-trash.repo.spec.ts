import { Logger } from '@nestjs/common';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { DocumentRepository } from './document.repo';

const now = new Date('2026-10-04T12:00:00Z');
const deletedAt = new Date('2026-09-04T12:00:00Z');
const row = {
  id: 42,
  publicId: 'doc',
  knowledgeSpaceId: 7,
  isDeleted: false,
  deletedAt: null,
  purgeAfter: null,
  purgeStartedAt: null,
  purgedAt: null,
  status: 'Ready',
  updatedAt: now,
  title: 'Restricted.md',
  fileType: 'MD',
  visibility: 'Restricted',
  category: { publicId: 'cat', name: 'Guides' },
  author: { publicId: 'user', username: 'Editor', avatarUrl: null },
  _count: { answerSources: 2 },
};
function setup(overrides = {}) {
  const document = { ...row, ...overrides };
  const tx = {
    $queryRaw: jest
      .fn<Promise<({ id: number } | { now: Date })[]>, [TemplateStringsArray]>()
      .mockImplementation((query: TemplateStringsArray) =>
        Promise.resolve(
          query.join('').includes('FOR UPDATE') ? [{ id: 42 }] : [{ now }],
        ),
      ),
    document: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(document),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...document, ...data }),
        ),
    },
    knowledgeSpace: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const repo = new DocumentRepository({
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService);
  return { repo, tx };
}
describe('locked document trash mutations', () => {
  beforeEach(() =>
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
  );
  afterEach(() => jest.restoreAllMocks());
  it.each(['Ready', 'Failed', 'Processing'])(
    'deletes %s with database deadline and monotonic version',
    async (status) => {
      const { repo, tx } = setup({ status });
      expect((await repo.softDeleteDocument('doc', 7)).isOk()).toBe(true);
      expect(tx.document.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: expect.objectContaining({
          isDeleted: true,
          deletedAt: now,
          purgeAfter: new Date('2026-11-03T12:00:00Z'),
          updatedAt: new Date(now.getTime() + 1),
        }) as object,
      });
      expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');
    },
  );
  it('does not change an existing deletion deadline', async () => {
    const { repo, tx } = setup({ isDeleted: true, deletedAt, purgeAfter: now });
    expect((await repo.softDeleteDocument('doc', 7)).isOk()).toBe(true);
    expect(tx.document.update).not.toHaveBeenCalled();
  });
  it('protects the current system FAQ', async () => {
    const { repo, tx } = setup();
    tx.knowledgeSpace.findFirst.mockResolvedValueOnce({ id: 7 });
    expect(
      (await repo.softDeleteDocument('doc', 7))._unsafeUnwrapErr().code,
    ).toBe('CONFLICT');
  });
  it('returns not found for a missing document', async () => {
    const { repo, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);
    expect(
      (await repo.softDeleteDocument('doc', 7))._unsafeUnwrapErr().code,
    ).toBe('NOT_FOUND');
  });
  it.each(['Ready', 'Failed', 'Processing'])(
    'restores %s from the written snapshot without changing data or permissions',
    async (status) => {
      const { repo, tx } = setup({
        status,
        isDeleted: true,
        deletedAt: now,
        purgeAfter: new Date('2026-11-03T12:00:00Z'),
      });
      const result = (await repo.restoreDocument('doc', 7))._unsafeUnwrap();
      expect(result.status).toBe(status === 'Processing' ? 'Failed' : status);
      expect(result.visibility).toBe('Restricted');
      expect(tx.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            isDeleted: false,
            deletedAt: null,
            purgeAfter: null,
            purgeStartedAt: null,
            purgedAt: null,
            status: status === 'Processing' ? 'Failed' : status,
            updatedAt: new Date(now.getTime() + 1),
          },
        }),
      );
      expect(tx.document.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects restore of an active document', async () => {
    const { repo } = setup();
    expect((await repo.restoreDocument('doc', 7))._unsafeUnwrapErr().code).toBe(
      'CONFLICT',
    );
  });
  it.each([
    { purgeAfter: now },
    { purgeAfter: deletedAt },
    { purgeStartedAt: now },
    { purgedAt: now, purgeStartedAt: now },
  ])('rejects expired or claimed restore %j', async (overrides) => {
    const { repo, tx } = setup({
      isDeleted: true,
      deletedAt,
      purgeAfter: new Date('2026-11-03T12:00:00Z'),
      ...overrides,
    });
    expect((await repo.restoreDocument('doc', 7))._unsafeUnwrapErr().code).toBe(
      'GONE',
    );
    expect(tx.document.update).not.toHaveBeenCalled();
  });
});
