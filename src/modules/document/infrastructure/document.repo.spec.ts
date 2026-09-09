/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { DocumentRepository } from './document.repo';

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
