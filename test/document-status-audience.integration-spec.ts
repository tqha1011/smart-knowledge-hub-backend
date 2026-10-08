import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { PrismaClient } from 'generated/prisma/client';
import { Pool } from 'pg';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { DocumentStatusAudienceRepository } from 'src/shared/infrastructure/notification/document-status-audience.repo';
import { DocumentStatusPayload } from 'src/shared/infrastructure/notification/realtime-notifier.interface';

const url = process.env.DOCUMENT_REALTIME_TEST_DATABASE_URL;
if (!url)
  throw new Error(
    'Set DOCUMENT_REALTIME_TEST_DATABASE_URL to a migrated, dedicated test database',
  );
const pool = new Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const audience = new DocumentStatusAudienceRepository(
  prisma as unknown as PrismaService,
);

describe('document status audience on PostgreSQL', () => {
  let userIds: number[];
  let spaceId: number;
  let documentId: number;
  let payload: DocumentStatusPayload;

  beforeAll(async () => {
    const users = await Promise.all(
      ['Owner', 'Editor', 'Viewer', 'Viewer'].map((role) =>
        prisma.user.create({
          data: {
            email: `${randomUUID()}@test.local`,
            username: role,
            password: 'unused',
          },
        }),
      ),
    );
    userIds = users.map((user) => user.id);
    const type = await prisma.knowledgeSpaceType.create({
      data: { name: randomUUID() },
    });
    const space = await prisma.knowledgeSpace.create({
      data: { name: 'Realtime tests', typeId: type.id },
    });
    spaceId = space.id;
    const category = await prisma.category.create({
      data: { name: 'Guides', knowledgeSpaceId: spaceId },
    });
    for (let i = 0; i < 3; i++)
      await prisma.userWorkspace.create({
        data: {
          userId: userIds[i],
          knowledgeSpaceId: spaceId,
          role: i === 0 ? 'Owner' : i === 1 ? 'Editor' : 'Viewer',
        },
      });
    const doc = await prisma.document.create({
      data: {
        title: 'Guide.txt',
        status: 'Ready',
        fileType: 'TXT',
        fileSize: 10,
        storagePath: randomUUID(),
        authorId: userIds[0],
        knowledgeSpaceId: spaceId,
        categoryId: category.id,
      },
    });
    documentId = doc.id;
    payload = {
      documentPublicId: doc.publicId,
      knowledgeSpacePublicId: space.publicId,
      fileName: doc.title,
      status: 'Ready',
      updatedAt: doc.updatedAt.toISOString(),
    };
  });

  beforeEach(async () => {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        visibility: 'Public',
        status: 'Ready',
        isDeleted: false,
        deletedAt: null,
        purgeAfter: null,
        updatedAt: new Date(payload.updatedAt),
      },
    });
    await prisma.documentPermission.deleteMany({ where: { documentId } });
    await prisma.userWorkspace.upsert({
      where: {
        unique_user_workspace_per_space: {
          userId: userIds[2],
          knowledgeSpaceId: spaceId,
        },
      },
      create: { userId: userIds[2], knowledgeSpaceId: spaceId, role: 'Viewer' },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
  const recipients = () => audience.getRecipientUserIds(spaceId, payload);

  it('Public reaches current members only', async () => {
    expect((await recipients()).sort()).toEqual(userIds.slice(0, 3).sort());
  });

  it('Restricted requires explicit permission even for Owner and Editor', async () => {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        visibility: 'Restricted',
        updatedAt: new Date(payload.updatedAt),
      },
    });
    expect(await recipients()).toEqual([]);
    await prisma.documentPermission.createMany({
      data: [
        { documentId, userId: userIds[2], permission: 'Read' },
        { documentId, userId: userIds[3], permission: 'Manage' },
      ],
    });
    expect(await recipients()).toEqual([userIds[2]]);
  });

  it('removes a member from the next notification audience', async () => {
    expect(await recipients()).toContain(userIds[2]);
    await prisma.userWorkspace.delete({
      where: {
        unique_user_workspace_per_space: {
          userId: userIds[2],
          knowledgeSpaceId: spaceId,
        },
      },
    });
    expect(await recipients()).not.toContain(userIds[2]);
  });

  it('removes a revoked permission from the next notification audience', async () => {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        visibility: 'Restricted',
        updatedAt: new Date(payload.updatedAt),
      },
    });
    await prisma.documentPermission.create({
      data: { documentId, userId: userIds[2], permission: 'Edit' },
    });
    expect(await recipients()).toEqual([userIds[2]]);
    await prisma.documentPermission.deleteMany({ where: { documentId } });
    expect(await recipients()).toEqual([]);
  });

  it.each([
    'deleted',
    'status',
    'version',
    'space ID',
    'space public ID',
    'document public ID',
  ])(
    'has no audience for an outdated or mismatched event (%s)',
    async (changed) => {
      if (changed === 'deleted')
        await prisma.document.update({
          where: { id: documentId },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
            purgeAfter: new Date(Date.now() + 86400000),
            updatedAt: new Date(payload.updatedAt),
          },
        });
      if (changed === 'status')
        await prisma.document.update({
          where: { id: documentId },
          data: { status: 'Failed', updatedAt: new Date(payload.updatedAt) },
        });
      if (changed === 'version')
        await prisma.document.update({
          where: { id: documentId },
          data: {
            updatedAt: new Date(new Date(payload.updatedAt).getTime() + 1),
          },
        });
      const event = { ...payload };
      if (changed === 'space public ID')
        event.knowledgeSpacePublicId = randomUUID();
      if (changed === 'document public ID')
        event.documentPublicId = randomUUID();
      expect(
        await audience.getRecipientUserIds(
          changed === 'space ID' ? -1 : spaceId,
          event,
        ),
      ).toEqual([]);
    },
  );
});
