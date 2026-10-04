import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  PrismaClient,
  DocumentStatus,
  DocumentVisibility,
} from 'generated/prisma/client';
import { Pool } from 'pg';
import { ok, err } from 'neverthrow';
import { IUnansweredQuestionRepository } from 'src/modules/chat/domain/repositories/unanswered-question.repo.interface';
import { IUnansweredQuestionQueryRepository } from 'src/modules/chat/application/interfaces/unanswered-question.query.repo.interface';
import { UnansweredQuestionService } from 'src/modules/chat/application/services/unanswered-question.service';
import { ICategoryRepository } from 'src/modules/category/domain/repositories/category.repo.interface';
import { DocumentRepository } from 'src/modules/document/infrastructure/document.repo';
import {
  DocumentCleanupRepository,
  DocumentPurgePayload,
} from 'src/modules/document/infrastructure/document-cleanup.repo';
import { DocumentCleanupService } from 'src/modules/document/application/services/document-cleanup.service';
import { DocumentPermissionRepository } from 'src/modules/document/infrastructure/document-permission.repo';
import { DocumentChunkRepository } from 'src/modules/rag/infrastructure/document-chunk.repo';
import { KnowledgeSpaceRepository } from 'src/modules/knowledge-space/infrastructure/knowledgeSpace.repo';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { IFileStorage } from 'src/shared/infrastructure/storage/file-storage.interface';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import {
  CommonDocumentStatus,
  CommonDocumentType,
  CommonDocumentVisibility,
  CommonPermissionType,
} from 'src/shared/domain/enum';
import { Document } from 'src/modules/document/domain/entities/document.entity';

const integrationUrl = process.env.DOCUMENT_TRASH_TEST_DATABASE_URL;
// This suite must never fall back to the application's DATABASE_URL.
if (!integrationUrl)
  throw new Error(
    'Set DOCUMENT_TRASH_TEST_DATABASE_URL to a migrated, dedicated PostgreSQL/pgvector test database',
  );
const pool = new Pool({ connectionString: integrationUrl, max: 10 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const db = prisma as unknown as PrismaService;
const repo = new DocumentRepository(db);
const cleanup = new DocumentCleanupRepository(db);
const chunks = new DocumentChunkRepository(db);
const permissions = new DocumentPermissionRepository(db);
const spaces = new KnowledgeSpaceRepository(db);
const vector = Array.from({ length: 1536 }, () => 0.1);
let userId: number;
let userPublicId: string;
let spaceId: number;
let categoryId: number;
const page = { pageNumber: 1, pageSize: 1000 };

async function create(
  status: DocumentStatus = 'Ready',
  visibility: DocumentVisibility = 'Public',
  key = randomUUID(),
) {
  const doc = await prisma.document.create({
    data: {
      title: `Guide-${randomUUID()}.md`,
      content: 'original content',
      description: 'metadata',
      authorId: userId,
      knowledgeSpaceId: spaceId,
      categoryId,
      status,
      visibility,
      fileType: 'MD',
      fileSize: 12,
      storagePath: key,
    },
  });
  await prisma.documentStorageKey.upsert({
    where: { key },
    create: { key, documentId: doc.id },
    update: {},
  });
  return doc;
}
async function withChunks(doc: Awaited<ReturnType<typeof create>>) {
  await prisma.document.update({
    where: { id: doc.id },
    data: { status: 'Processing', updatedAt: doc.updatedAt },
  });
  const committed = (
    await chunks.addChunks({
      documentId: doc.id,
      knowledgeSpaceId: spaceId,
      expectedUpdatedAt: doc.updatedAt,
      embeddingResult: [
        {
          chunkIndex: 0,
          content: 'original chunk',
          embedding: vector,
          tokens: 2,
        },
      ],
    })
  )._unsafeUnwrap();
  expect(committed).not.toBeNull();
  return prisma.documentChunk.findFirstOrThrow({
    where: { documentId: doc.id },
  });
}
async function expire(doc: Awaited<ReturnType<typeof create>>) {
  await repo.softDeleteDocument(doc.publicId, spaceId);
  return prisma.document.update({
    where: { id: doc.id },
    data: {
      deletedAt: new Date(Date.now() - 31 * 86400000),
      purgeAfter: new Date(Date.now() - 86400000),
    },
  });
}
function payload(doc: { publicId: string; deletedAt: Date | null }) {
  return {
    documentPublicId: doc.publicId,
    deletedAt: doc.deletedAt!.toISOString(),
  };
}
function newEntity(key: string) {
  return Document.createDocument({
    title: 'new.md',
    description: null,
    content: null,
    authorId: userId,
    knowledgeSpaceId: spaceId,
    categoryId,
    visibility: CommonDocumentVisibility.Public,
    fileType: CommonDocumentType.MD,
    fileSize: 10,
    storagePath: key,
  })._unsafeUnwrap();
}

describe('document trash on PostgreSQL/pgvector', () => {
  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@test.local`,
        username: 'test',
        password: 'unused',
      },
    });
    userId = user.id;
    userPublicId = user.publicId;
    const type = await prisma.knowledgeSpaceType.create({
      data: { name: randomUUID() },
    });
    const space = await prisma.knowledgeSpace.create({
      data: { name: 'trash integration', typeId: type.id },
    });
    spaceId = space.id;
    const category = await prisma.category.create({
      data: { name: 'Guides', knowledgeSpaceId: spaceId },
    });
    categoryId = category.id;
    await prisma.userWorkspace.create({
      data: { userId, knowledgeSpaceId: spaceId, role: 'Owner' },
    });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await prisma.$disconnect();
    await pool.end();
  });

  it('upgrades legacy rows as active, backfills shared key ownership, and preserves citations on chunk deletion', async () => {
    const client = await pool.connect();
    const schema = `trash_upgrade_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}", public`);
      const migrations = readdirSync(join(process.cwd(), 'prisma/migrations'))
        .filter((name) => name.startsWith('20'))
        .sort();
      const latest = '20261004160000_document_trash';
      for (const name of migrations.filter((name) => name !== latest))
        await client.query(
          readFileSync(
            join(process.cwd(), 'prisma/migrations', name, 'migration.sql'),
            'utf8',
          ),
        );
      await client.query(`INSERT INTO "user" (public_id, username, email, password, updated_at) VALUES ('u', 'u', 'u@test', 'x', now());
        INSERT INTO knowledge_space_type (public_id, name, updated_at) VALUES ('t','t',now());
        INSERT INTO knowledge_space (public_id, name, type_id, updated_at) VALUES ('s','s',1,now());
        INSERT INTO category (public_id, name, knowledge_space_id, updated_at) VALUES ('c','c',1,now());
        INSERT INTO document (public_id,title,content,storage_path,file_type,file_size,updated_at,knowledge_space_id,author_id,category_id)
          VALUES ('d','legacy','private','shared','MD',1,now(),1,1,1), ('e','shared legacy','private','shared','MD',1,now(),1,1,1);
        INSERT INTO chat_sessions (public_id,title,user_id,knowledge_space_id,updated_at) VALUES ('session','session',1,1,now());
        INSERT INTO chat_messages (public_id,chat_session_id,role,content,updated_at) VALUES ('message',1,'Assistant','unchanged',now());`);
      await client.query(
        `INSERT INTO document_chunk (document_id,knowledge_space_id,chunk_index,content_chunk,token_count,embedding,updated_at) VALUES (1,1,0,'private chunk',1,$1::vector,now())`,
        [`[${vector.join(',')}]`],
      );
      await client.query(
        'INSERT INTO answer_source (message_id,document_id,knowledge_space_id,chunk_id,score) VALUES (1,1,1,1,0.9)',
      );
      await client.query(
        readFileSync(
          join(process.cwd(), 'prisma/migrations', latest, 'migration.sql'),
          'utf8',
        ),
      );
      const legacy = await client.query(
        'SELECT is_deleted,deleted_at,purge_after,purge_started_at,purged_at,content FROM document ORDER BY id',
      );
      expect(legacy.rows).toEqual(
        Array.from({ length: 2 }, () => ({
          is_deleted: false,
          deleted_at: null,
          purge_after: null,
          purge_started_at: null,
          purged_at: null,
          content: 'private',
        })),
      );
      expect(
        (await client.query('SELECT key,document_id FROM document_storage_key'))
          .rows,
      ).toEqual([{ key: 'shared', document_id: 1 }]);
      await client.query('DELETE FROM document_chunk WHERE id = 1');
      expect(
        (
          await client.query(
            'SELECT document_id,message_id,chunk_id,score FROM answer_source',
          )
        ).rows,
      ).toEqual([
        { document_id: 1, message_id: 1, chunk_id: null, score: 0.9 },
      ]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it.each(['Ready', 'Failed', 'Processing'] as const)(
    'deletes/restores %s and preserves content, chunks and permissions',
    async (status) => {
      const doc = await create(status, 'Restricted');
      const chunk = await withChunks(doc);
      await prisma.document.update({ where: { id: doc.id }, data: { status } });
      await prisma.documentPermission.create({
        data: { documentId: doc.id, userId, permission: 'Read' },
      });
      expect(
        (await repo.softDeleteDocument(doc.publicId, spaceId)).isOk(),
      ).toBe(true);
      const deleted = await prisma.document.findUniqueOrThrow({
        where: { id: doc.id },
      });
      expect(deleted.purgeAfter!.getTime() - deleted.deletedAt!.getTime()).toBe(
        30 * 86400000,
      );
      expect(deleted.updatedAt.getTime()).toBeGreaterThan(
        doc.updatedAt.getTime(),
      );
      expect(
        (await repo.softDeleteDocument(doc.publicId, spaceId)).isOk(),
      ).toBe(true);
      expect(
        await prisma.document.findUnique({ where: { id: doc.id } }),
      ).toEqual(deleted);
      expect(
        (await repo.restoreDocument(doc.publicId, spaceId))._unsafeUnwrap()
          .status,
      ).toBe(status === 'Processing' ? 'Failed' : status);
      expect(
        (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } }))
          .content,
      ).toBe('original content');
      expect(
        await prisma.documentChunk.findUnique({ where: { id: chunk.id } }),
      ).not.toBeNull();
      expect(
        await prisma.documentPermission.count({
          where: { documentId: doc.id },
        }),
      ).toBe(1);
      await repo.softDeleteDocument(doc.publicId, spaceId);
      const second = await prisma.document.findUniqueOrThrow({
        where: { id: doc.id },
      });
      expect(second.purgeAfter!.getTime()).toBeGreaterThanOrEqual(
        deleted.purgeAfter!.getTime(),
      );
      expect(second.purgeStartedAt).toBeNull();
    },
  );

  it('enforces positive retention and stores configured deadline only at deletion', async () => {
    for (const value of ['0', '-1', '1.5', 'abc', ''])
      expect(
        () =>
          new DocumentRepository(
            db,
            new ConfigService({ DOCUMENT_TRASH_RETENTION_DAYS: value }),
          ),
      ).toThrow();
    const configured = new DocumentRepository(
      db,
      new ConfigService({ DOCUMENT_TRASH_RETENTION_DAYS: '1' }),
    );
    const doc = await create();
    await configured.softDeleteDocument(doc.publicId, spaceId);
    const snapshot = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
    });
    expect(snapshot.purgeAfter!.getTime() - snapshot.deletedAt!.getTime()).toBe(
      86400000,
    );
    await repo.softDeleteDocument(doc.publicId, spaceId);
    expect(
      (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } }))
        .purgeAfter,
    ).toEqual(snapshot.purgeAfter);
  });

  it('hides deleted documents from detail/download/update/retry/permissions/list/search/counts and RAG', async () => {
    const doc = await create('Ready', 'Restricted');
    const chunk = await withChunks(doc);
    await prisma.documentPermission.create({
      data: { documentId: doc.id, userId, permission: 'Read' },
    });
    const cachedPage = (
      await repo.getDocumentListInKnowledgeSpace(spaceId, userId, page)
    )._unsafeUnwrap();
    const cachedChunks = (
      await chunks.searchSimilarChunks(spaceId, userId, vector, 100, {
        public: true,
        restricted: true,
      })
    )._unsafeUnwrap();
    expect(cachedChunks.some((c) => c.chunkId === chunk.id)).toBe(true);
    const countBefore = (
      await spaces.getKnowledgeSpacesForUser(userPublicId, page)
    )._unsafeUnwrap();
    await repo.softDeleteDocument(doc.publicId, spaceId);
    for (const result of [
      await repo.getDocumentIdByPublicId(doc.publicId, spaceId),
      await repo.getDocumentStorageDataByPublicId(doc.publicId, spaceId),
      await repo.getDocumentDetail(spaceId, doc.publicId),
      await repo.getDocumentContentById(doc.id),
      await repo.getDocumentIngestionDataByPublicId(doc.publicId),
      await permissions.checkDocumentPermission(doc.id, userId),
    ])
      expect(result._unsafeUnwrap()).toBeNull();
    expect(
      (await repo.updateDocument(doc.id, { content: 'resurrection' })).isErr(),
    ).toBe(true);
    expect(
      (
        await repo.transitionDocumentStatus(
          doc.publicId,
          spaceId,
          CommonDocumentStatus.Ready,
          doc.updatedAt,
          CommonDocumentStatus.Processing,
        )
      )._unsafeUnwrap(),
    ).toBeNull();
    expect(
      (await permissions.updateDocumentPermission(doc.id, [])).isErr(),
    ).toBe(true);
    expect(
      (
        await permissions.addDocumentPermission([
          { documentId: doc.id, userId, permission: CommonPermissionType.Read },
        ])
      ).isErr(),
    ).toBe(true);
    expect(
      (await repo.getDocumentListInKnowledgeSpace(spaceId, userId, page))
        ._unsafeUnwrap()
        .items.some((d) => d.publicId === doc.publicId),
    ).toBe(false);
    expect(
      (
        await repo.searchDocumentsInKnowledgeSpace(
          spaceId,
          userId,
          doc.title,
          page,
        )
      )._unsafeUnwrap().items,
    ).toEqual([]);
    expect(
      (
        await repo.validateCachedDocumentList(spaceId, userId, page, cachedPage)
      )._unsafeUnwrap(),
    ).toBe(false);
    expect(
      (await chunks.validateSimilarChunks(spaceId, userId, cachedChunks))
        ._unsafeUnwrap()
        .some((c) => c.chunkId === chunk.id),
    ).toBe(false);
    expect(
      (
        await chunks.searchSimilarChunks(spaceId, userId, vector, 100, {
          public: true,
          restricted: true,
        })
      )
        ._unsafeUnwrap()
        .some((c) => c.chunkId === chunk.id),
    ).toBe(false);
    const countAfter = (
      await spaces.getKnowledgeSpacesForUser(userPublicId, page)
    )._unsafeUnwrap();
    expect(countAfter.items[0].totalDocuments).toBe(
      countBefore.items[0].totalDocuments - 1,
    );
  });

  it('validates current Restricted permission and Processing status even for cached chunks', async () => {
    const doc = await create('Ready', 'Restricted');
    await withChunks(doc);
    await prisma.documentPermission.create({
      data: { documentId: doc.id, userId, permission: 'Read' },
    });
    const retrieved = (
      await chunks.searchSimilarChunks(spaceId, userId, vector, 100, {
        public: false,
        restricted: true,
      })
    )
      ._unsafeUnwrap()
      .filter((c) => c.documentId === doc.id);
    expect(retrieved).toHaveLength(1);
    await prisma.documentPermission.deleteMany({
      where: { documentId: doc.id },
    });
    expect(
      (
        await chunks.validateSimilarChunks(spaceId, userId, retrieved)
      )._unsafeUnwrap(),
    ).toEqual([]);
    await prisma.document.update({
      where: { id: doc.id },
      data: { visibility: 'Public', status: 'Processing' },
    });
    expect(
      (
        await chunks.validateSimilarChunks(spaceId, userId, retrieved)
      )._unsafeUnwrap(),
    ).toEqual([]);
  });

  it('protects the current FAQ and scopes mutations to the correct space', async () => {
    const doc = await create();
    await spaces.setFaqDocumentId(spaceId, doc.id);
    expect(
      (await repo.softDeleteDocument(doc.publicId, spaceId))._unsafeUnwrapErr()
        .code,
    ).toBe(ErrorCode.Conflict);
    expect(
      (
        await repo.softDeleteDocument(doc.publicId, spaceId + 1000)
      )._unsafeUnwrapErr().code,
    ).toBe(ErrorCode.NotFound);
    await prisma.knowledgeSpace.update({
      where: { id: spaceId },
      data: { faqDocumentId: null },
    });
  });

  it('excludes expired/claimed trash and returns Gone at and after the deadline', async () => {
    const doc = await create('Failed', 'Restricted');
    await repo.softDeleteDocument(doc.publicId, spaceId);
    expect(
      (await repo.getDocumentTrash(spaceId, page))
        ._unsafeUnwrap()
        .items.some((d) => d.publicId === doc.publicId),
    ).toBe(true);
    await prisma.$executeRaw`UPDATE document SET purge_after = date_trunc('milliseconds', clock_timestamp()) WHERE id = ${doc.id}`;
    expect(
      (await repo.restoreDocument(doc.publicId, spaceId))._unsafeUnwrapErr()
        .code,
    ).toBe(ErrorCode.Gone);
    expect(
      (await repo.getDocumentTrash(spaceId, page))
        ._unsafeUnwrap()
        .items.some((d) => d.publicId === doc.publicId),
    ).toBe(false);
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        purgeAfter: new Date(Date.now() + 86400000),
        purgeStartedAt: new Date(),
      },
    });
    expect(
      (await repo.restoreDocument(doc.publicId, spaceId))._unsafeUnwrapErr()
        .code,
    ).toBe(ErrorCode.Gone);
  });

  it('serializes competing delete/restore and rejects stale ingestion after delete, restore and retry', async () => {
    const doc = await create('Processing');
    const input = {
      documentId: doc.id,
      knowledgeSpaceId: spaceId,
      expectedUpdatedAt: doc.updatedAt,
      embeddingResult: [
        { chunkIndex: 0, content: 'stale', embedding: vector, tokens: 1 },
      ],
    };
    await Promise.all([
      repo.softDeleteDocument(doc.publicId, spaceId),
      repo.softDeleteDocument(doc.publicId, spaceId),
    ]);
    expect((await chunks.addChunks(input))._unsafeUnwrap()).toBeNull();
    const restored = await Promise.all([
      repo.restoreDocument(doc.publicId, spaceId),
      repo.restoreDocument(doc.publicId, spaceId),
    ]);
    expect(restored.filter((r) => r.isOk())).toHaveLength(1);
    expect(restored.filter((r) => r.isErr())[0]._unsafeUnwrapErr().code).toBe(
      ErrorCode.Conflict,
    );
    const snapshot = restored.find((r) => r.isOk())!._unsafeUnwrap();
    const retry = (
      await repo.transitionDocumentStatus(
        doc.publicId,
        spaceId,
        CommonDocumentStatus.Failed,
        snapshot.lastUpdated,
        CommonDocumentStatus.Processing,
      )
    )._unsafeUnwrap()!;
    expect((await chunks.addChunks(input))._unsafeUnwrap()).toBeNull();
    expect(
      (
        await repo.transitionDocumentStatus(
          doc.publicId,
          spaceId,
          CommonDocumentStatus.Processing,
          doc.updatedAt,
          CommonDocumentStatus.Failed,
        )
      )._unsafeUnwrap(),
    ).toBeNull();
    expect(
      (
        await chunks.addChunks({ ...input, expectedUpdatedAt: retry })
      )._unsafeUnwrap(),
    ).not.toBeNull();
    expect(
      await prisma.documentChunk.count({ where: { documentId: doc.id } }),
    ).toBe(1);
    await Promise.all([
      repo.softDeleteDocument(doc.publicId, spaceId),
      repo.restoreDocument(doc.publicId, spaceId),
    ]);
    const final = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
    });
    expect(
      final.isDeleted ? final.deletedAt !== null : final.deletedAt === null,
    ).toBe(true);
  });

  it('waits for the row lock and cannot commit ingestion when deletion wins', async () => {
    const doc = await create('Processing');
    let release!: () => void;
    let acquired!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const deleting = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM document WHERE id = ${doc.id} FOR UPDATE`;
      acquired();
      await gate;
      await tx.document.update({
        where: { id: doc.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          purgeAfter: new Date(Date.now() + 86400000),
          updatedAt: new Date(doc.updatedAt.getTime() + 1),
        },
      });
    });
    await ready;
    const committing = chunks.addChunks({
      documentId: doc.id,
      knowledgeSpaceId: spaceId,
      expectedUpdatedAt: doc.updatedAt,
      embeddingResult: [
        { chunkIndex: 0, content: 'late', embedding: vector, tokens: 1 },
      ],
    });
    release();
    await deleting;
    expect((await committing)._unsafeUnwrap()).toBeNull();
    expect(
      await prisma.documentChunk.count({ where: { documentId: doc.id } }),
    ).toBe(0);
    expect(
      (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } }))
        .status,
    ).toBe('Processing');
  });

  it('commits chunks and Ready atomically; database error rolls back chunks and status', async () => {
    const doc = await create('Processing');
    const result = await chunks.addChunks({
      documentId: doc.id,
      knowledgeSpaceId: spaceId,
      expectedUpdatedAt: doc.updatedAt,
      embeddingResult: [
        { chunkIndex: 0, content: 'bad vector', embedding: [0.1], tokens: 1 },
      ],
    });
    expect(result.isErr()).toBe(true);
    expect(
      await prisma.documentChunk.count({ where: { documentId: doc.id } }),
    ).toBe(0);
    expect(
      (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } }))
        .status,
    ).toBe('Processing');
    await withChunks(doc);
    expect(
      (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } }))
        .status,
    ).toBe('Ready');
  });

  it('purges only the matching deletion, resumes after crash, preserves citation FKs and removes private data', async () => {
    const doc = await create();
    const chunk = await withChunks(doc);
    await prisma.documentPermission.create({
      data: { documentId: doc.id, userId, permission: 'Read' },
    });
    const session = await prisma.chatSession.create({
      data: { title: 'history', userId, knowledgeSpaceId: spaceId },
    });
    const message = await prisma.chatMessage.create({
      data: {
        chatSessionId: session.id,
        role: 'Assistant',
        content: 'old answer',
      },
    });
    const source = await prisma.answerSource.create({
      data: {
        messageId: message.id,
        documentId: doc.id,
        knowledgeSpaceId: spaceId,
        chunkId: chunk.id,
        score: 0.9,
      },
    });
    const deleted = await expire(doc);
    expect(
      await cleanup.claimPurge({
        ...payload(deleted),
        deletedAt: new Date(deleted.deletedAt!.getTime() - 1).toISOString(),
      }),
    ).toBeNull();
    expect(await cleanup.claimPurge(payload(deleted))).not.toBeNull();
    expect(
      (await repo.restoreDocument(doc.publicId, spaceId))._unsafeUnwrapErr()
        .code,
    ).toBe(ErrorCode.Gone);
    const started = (
      await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    ).purgeStartedAt;
    expect(
      (await cleanup.scanExpired(0, 1000)).some((d) => d.id === doc.id),
    ).toBe(true);
    expect(await cleanup.claimPurge(payload(deleted))).not.toBeNull();
    expect(
      (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } }))
        .purgeStartedAt,
    ).toEqual(started);
    expect(await cleanup.finalizePurge(payload(deleted))).toBe(true);
    expect(await cleanup.finalizePurge(payload(deleted))).toBe(false);
    const purged = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
    });
    expect(purged.content).toBeNull();
    expect(purged.title).toBe(doc.title);
    expect(purged.purgedAt).not.toBeNull();
    expect(
      await prisma.documentChunk.count({ where: { documentId: doc.id } }),
    ).toBe(0);
    expect(
      await prisma.documentPermission.count({ where: { documentId: doc.id } }),
    ).toBe(0);
    expect(
      await prisma.answerSource.findUniqueOrThrow({ where: { id: source.id } }),
    ).toMatchObject({
      chunkId: null,
      documentId: doc.id,
      messageId: message.id,
      score: 0.9,
    });
    expect(
      (
        await prisma.chatMessage.findUniqueOrThrow({
          where: { id: message.id },
        })
      ).content,
    ).toBe('old answer');
  });

  it('preserves a shared file for active/recoverable documents and retries after R2 success/DB failure', async () => {
    const key = randomUUID();
    const doc = await create('Ready', 'Public', key);
    const protectedDoc = await create('Ready', 'Public', key);
    const expired = await expire(doc);
    const storage = {
      DeleteObject: jest.fn().mockResolvedValue(ok(undefined)),
    };
    const service = new DocumentCleanupService(
      cleanup,
      storage as unknown as IFileStorage,
      {} as Queue,
      {
        set: jest.fn().mockResolvedValue(undefined),
      } as unknown as IApplicationCache,
    );
    await service.process({
      name: 'purge',
      data: payload(expired),
    } as Job<DocumentPurgePayload>);
    expect(storage.DeleteObject).not.toHaveBeenCalled();
    expect(
      (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } }))
        .purgedAt,
    ).not.toBeNull();
    await repo.softDeleteDocument(protectedDoc.publicId, spaceId);
    expect(await cleanup.canDeleteStorageObject(key)).toBe(false);
    const second = await expire(protectedDoc);
    const finalize = jest
      .spyOn(cleanup, 'finalizePurge')
      .mockRejectedValueOnce(new Error('DB after R2'));
    await expect(
      service.process({
        name: 'purge',
        data: payload(second),
      } as Job<DocumentPurgePayload>),
    ).rejects.toThrow('DB after R2');
    storage.DeleteObject.mockResolvedValueOnce(
      err(new AppError(ErrorCode.NotFound, 'already absent')),
    );
    await service.process({
      name: 'purge',
      data: payload(second),
    } as Job<DocumentPurgePayload>);
    expect(storage.DeleteObject).toHaveBeenCalledTimes(2);
    finalize.mockRestore();
  });

  it('prevents concurrent storage-key registration and reuse after replacement or purge', async () => {
    const key = randomUUID();
    const results = await Promise.all([
      repo.addDocument(newEntity(key)),
      repo.addDocument(newEntity(key)),
    ]);
    expect(results.filter((r) => r.isOk())).toHaveLength(1);
    const doc = await prisma.document.findFirstOrThrow({
      where: { storagePath: key },
    });
    expect(
      (await repo.updateDocument(doc.id, { storagePath: randomUUID() })).isOk(),
    ).toBe(true);
    expect((await repo.addDocument(newEntity(key))).isErr()).toBe(true);
    expect(
      (await repo.updateDocument(doc.id, { storagePath: key })).isErr(),
    ).toBe(true);
    const expired = await expire(doc);
    await cleanup.claimPurge(payload(expired));
    await cleanup.finalizePurge(payload(expired));
    expect((await repo.addDocument(newEntity(key))).isErr()).toBe(true);
  });

  it('recovers first FAQ creation after a failed link despite permanent key ownership', async () => {
    const question = {
      getUnresolvedQuestion: jest
        .fn()
        .mockResolvedValue(ok({ question: 'Can I recover?' })),
      markResolveQuestion: jest.fn().mockResolvedValue(ok(true)),
    };
    const categories = {
      getCategoryIdByName: jest.fn().mockResolvedValue(ok(categoryId)),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new UnansweredQuestionService(
      spaces,
      question as unknown as IUnansweredQuestionRepository,
      {} as IUnansweredQuestionQueryRepository,
      repo,
      categories as unknown as ICategoryRepository,
      queue as unknown as Queue,
    );
    await prisma.knowledgeSpace.update({
      where: { id: spaceId },
      data: { faqDocumentId: null },
    });
    const link = jest
      .spyOn(spaces, 'setFaqDocumentId')
      .mockResolvedValueOnce(err(new Error('link failed')));
    expect(
      (
        await service.resolveUnansweredQuestionAsync(
          (
            await prisma.knowledgeSpace.findUniqueOrThrow({
              where: { id: spaceId },
            })
          ).publicId,
          userPublicId,
          'question',
          'yes',
        )
      ).isErr(),
    ).toBe(true);
    expect(
      (
        await service.resolveUnansweredQuestionAsync(
          (
            await prisma.knowledgeSpace.findUniqueOrThrow({
              where: { id: spaceId },
            })
          ).publicId,
          userPublicId,
          'question',
          'yes',
        )
      ).isOk(),
    ).toBe(true);
    expect(question.markResolveQuestion).toHaveBeenCalledTimes(1);
    const faqId = (await spaces.getFaqDocumentId(spaceId))._unsafeUnwrap()!;
    const faq = await prisma.document.findUniqueOrThrow({
      where: { id: faqId },
    });
    expect(queue.add).toHaveBeenLastCalledWith(
      'ingestion-document',
      {
        documentPublicId: faq.publicId,
        expectedUpdatedAt: faq.updatedAt.toISOString(),
      },
      { attempts: 3 },
    );
    // Subsequent FAQ append must enqueue the exact committed mutation version.
    expect(
      (
        await service.resolveUnansweredQuestionAsync(
          (
            await prisma.knowledgeSpace.findUniqueOrThrow({
              where: { id: spaceId },
            })
          ).publicId,
          userPublicId,
          'another',
          'yes',
        )
      ).isOk(),
    ).toBe(true);
    const appended = await prisma.document.findUniqueOrThrow({
      where: { id: faqId },
    });
    expect(queue.add).toHaveBeenLastCalledWith(
      'ingestion-document',
      {
        documentPublicId: faq.publicId,
        expectedUpdatedAt: appended.updatedAt.toISOString(),
      },
      { attempts: 3 },
    );
    link.mockRestore();
    await prisma.knowledgeSpace.update({
      where: { id: spaceId },
      data: { faqDocumentId: null },
    });
  });

  it('cannot link a deleted document as the system FAQ', async () => {
    const doc = await create();
    await repo.softDeleteDocument(doc.publicId, spaceId);
    expect((await spaces.setFaqDocumentId(spaceId, doc.id)).isErr()).toBe(true);
  });

  it('protects keys written directly by seed/import even without a registry row', async () => {
    const doc = await create();
    await prisma.documentStorageKey.delete({ where: { key: doc.storagePath } });
    expect((await repo.addDocument(newEntity(doc.storagePath))).isErr()).toBe(
      true,
    );
    const target = await create();
    await prisma.documentStorageKey.delete({
      where: { key: target.storagePath },
    });
    expect(
      (
        await repo.updateDocument(doc.id, { storagePath: target.storagePath })
      ).isErr(),
    ).toBe(true);
    expect(
      (await repo.updateDocument(doc.id, { storagePath: randomUUID() })).isOk(),
    ).toBe(true);
    expect((await repo.addDocument(newEntity(doc.storagePath))).isErr()).toBe(
      true,
    );
  });

  it('enforces migration constraints for active, deleted and purged states', async () => {
    const doc = await create();
    await expect(
      prisma.document.update({
        where: { id: doc.id },
        data: { deletedAt: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.document.update({
        where: { id: doc.id },
        data: { isDeleted: true },
      }),
    ).rejects.toThrow();
    await repo.softDeleteDocument(doc.publicId, spaceId);
    await expect(
      prisma.document.update({
        where: { id: doc.id },
        data: { purgedAt: new Date() },
      }),
    ).rejects.toThrow();
  });
});
