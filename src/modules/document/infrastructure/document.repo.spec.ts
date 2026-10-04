/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { Logger } from '@nestjs/common';
import { DocumentRepository } from './document.repo';
import { CommonDocumentStatus } from 'src/shared/domain/enum';

describe('DocumentRepository.transitionDocumentStatus', () => {
  const updatedAt = new Date('2026-10-04T12:00:00Z');
  const expectedUpdatedAt = new Date('2026-10-01T12:00:00Z');
  const updateMany = jest.fn();
  const repository = new DocumentRepository({
    document: { updateMany },
  } as unknown as PrismaService);
  const transition = () =>
    repository.transitionDocumentStatus(
      'doc',
      7,
      CommonDocumentStatus.Failed,
      expectedUpdatedAt,
      CommonDocumentStatus.Processing,
    );

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(updatedAt);
    updateMany.mockReset().mockResolvedValue({ count: 1 });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('updates only the document in the expected space, status and timestamp and returns the written timestamp', async () => {
    expect((await transition())._unsafeUnwrap()).toEqual(updatedAt);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        publicId: 'doc',
        knowledgeSpaceId: 7,
        status: 'Failed',
        updatedAt: expectedUpdatedAt,
      },
      data: { status: 'Processing', updatedAt },
    });
  });

  it('returns null when the conditional update no longer matches', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await transition())._unsafeUnwrap()).toBeNull();
  });

  it('returns an error when the database rejects the update', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    updateMany.mockRejectedValueOnce(new Error('DB unavailable'));
    expect((await transition()).isErr()).toBe(true);
  });
});

describe('DocumentRepository.getDocumentListInKnowledgeSpace', () => {
  it('includes Public documents and authorized Restricted documents using the same filter for rows and count', async () => {
    const findMany = jest.fn().mockReturnValue(Promise.resolve([]));
    const count = jest.fn().mockReturnValue(Promise.resolve(3));
    const repository = new DocumentRepository({
      document: { findMany, count },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    } as unknown as PrismaService);
    const page = (
      await repository.getDocumentListInKnowledgeSpace(7, 8, {
        pageNumber: 3,
        pageSize: 2,
      })
    )._unsafeUnwrap();
    const where = {
      knowledgeSpaceId: 7,
      OR: [
        { visibility: 'Public' },
        {
          visibility: 'Restricted',
          documentPermissions: { some: { userId: 8 } },
        },
      ],
    };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 4, take: 2 }),
    );
    expect(count).toHaveBeenCalledWith({ where });
    expect(page.items).toEqual([]);
    expect(page.totalPages).toBe(2);
  });
});

describe('DocumentRepository.searchDocumentsInKnowledgeSpace', () => {
  const row = {
    publicId: 'doc',
    title: 'Employee Handbook.pdf',
    fileType: 'PDF',
    status: 'Ready',
    visibility: 'Restricted',
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    category: { publicId: 'cat', name: 'Guides' },
    author: { publicId: 'user', username: 'Author', avatarUrl: null },
    _count: { answerSources: 3 },
  };
  const findMany = jest.fn();
  const count = jest.fn();
  const transaction = jest.fn();
  const repository = new DocumentRepository({
    document: { findMany, count },
    $transaction: transaction,
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockReturnValue(Promise.resolve([row]));
    count.mockReturnValue(Promise.resolve(3));
    transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('filters both rows and count by space, case-insensitive partial title and caller permission', async () => {
    const page = (
      await repository.searchDocumentsInKnowledgeSpace(7, 8, 'hand', {
        pageNumber: 2,
        pageSize: 2,
      })
    )._unsafeUnwrap();
    const where = {
      knowledgeSpaceId: 7,
      title: { contains: 'hand', mode: 'insensitive' },
      OR: [
        { visibility: 'Public' },
        {
          visibility: 'Restricted',
          documentPermissions: { some: { userId: 8 } },
        },
      ],
    };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 2,
        take: 2,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        select: expect.objectContaining({
          _count: {
            select: { answerSources: { where: { knowledgeSpaceId: 7 } } },
          },
        }),
      }),
    );
    expect(count).toHaveBeenCalledWith({ where });
    expect(transaction).toHaveBeenCalledWith([
      findMany.mock.results[0].value,
      count.mock.results[0].value,
    ]);
    expect(page).toEqual({
      items: [
        {
          publicId: 'doc',
          title: 'Employee Handbook.pdf',
          fileType: 'PDF',
          status: 'Ready',
          visibility: 'Restricted',
          lastUpdated: new Date('2026-10-01T12:00:00Z'),
          category: { publicId: 'cat', name: 'Guides' },
          updatedBy: { publicId: 'user', name: 'Author', avatarUrl: null },
          cited: 3,
        },
      ],
      totalPages: 2,
      currentPage: 2,
      pageNumber: 2,
      pageSize: 2,
      hasPrevious: true,
      hasNext: false,
    });
  });

  it.each([
    [0, 1, 0],
    [3, 5, 2],
  ])(
    'returns an empty page with total=%i and page=%i',
    async (total, pageNumber, totalPages) => {
      findMany.mockReturnValueOnce(Promise.resolve([]));
      count.mockReturnValueOnce(Promise.resolve(total));
      const page = (
        await repository.searchDocumentsInKnowledgeSpace(7, 8, 'missing', {
          pageNumber,
          pageSize: 2,
        })
      )._unsafeUnwrap();
      expect(page.items).toEqual([]);
      expect(page.totalPages).toBe(totalPages);
      expect(page.pageNumber).toBe(pageNumber);
      expect(page.hasNext).toBe(false);
    },
  );

  it('returns a repository error when the transaction fails', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    transaction.mockRejectedValueOnce(new Error('DB unavailable'));
    const result = await repository.searchDocumentsInKnowledgeSpace(
      7,
      8,
      'hand',
      {
        pageNumber: 1,
        pageSize: 20,
      },
    );
    expect(result.isErr()).toBe(true);
  });
});

describe('DocumentRepository.getDocumentIngestionDataByPublicId', () => {
  it('includes the knowledge space public id alongside the document data', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 42,
      storagePath: 'docs/42.pdf',
      title: 'Handbook.pdf',
      status: 'Ready',
      visibility: 'Public',
      content: null,
      knowledgeSpaceId: 7,
      fileType: 'PDF',
      workspace: { publicId: 'ks-public-id-123' },
    });
    const mockPrismaService: {
      document: { findUnique: jest.Mock };
    } = {
      document: { findUnique },
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const repository = new DocumentRepository(mockPrismaService as any);

    const result =
      await repository.getDocumentIngestionDataByPublicId('doc-public-id');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toMatchObject({
        knowledgeSpaceId: 7,
        knowledgeSpacePublicId: 'ks-public-id-123',
      });
    }
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publicId: 'doc-public-id' },
        select: expect.objectContaining({
          workspace: { select: { publicId: true } },
        }),
      }),
    );
  });
});

describe('DocumentRepository.getDocumentIdByPublicId', () => {
  it('includes the authorized knowledge space in the lookup', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const repository = new DocumentRepository({
      document: { findUnique },
    } as unknown as PrismaService);

    const result = await repository.getDocumentIdByPublicId('doc-public-id', 7);

    expect(result.isOk() && result.value === null).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { publicId: 'doc-public-id', knowledgeSpaceId: 7 },
      select: { id: true },
    });
  });
});
