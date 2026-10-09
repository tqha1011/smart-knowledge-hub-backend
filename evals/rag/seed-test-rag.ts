import 'reflect-metadata';
import { config } from 'dotenv';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ChunkingService } from '../../src/modules/rag/application/services/chunking-service';
import { GeminiEmbeddingClient } from '../../src/modules/rag/infrastructure/gemini-embedding.client';
import { DocumentChunkRepository } from '../../src/modules/rag/infrastructure/document-chunk.repo';
import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { S3FileStorage } from '../../src/shared/infrastructure/storage/s3-file-storage';
import {
  assertDocumentMatches,
  assertEmbeddings,
  corpusRoot,
  hash,
  loadCorpus,
  vectorHash,
  writeDataset,
  type StoredChunk,
  saveLockedProgress,
  assertReadyVersion,
} from './test-rag-lib';

type Audit = {
  sha256: string;
  model: string;
  aiMock: false;
  client: 'GeminiEmbeddingClient';
  phase: 'prepared' | 'embedded' | 'ready';
  preparedVersion: string;
  committedVersion?: string;
  chunksSha256?: string;
  vectorsSha256?: string;
  chunkCount?: number;
  embeddedAt?: string;
};
type Progress = {
  version: 1;
  knowledgeSpacePublicId: string;
  documents: Record<string, Audit>;
  lastEvent?: { at: string; documentPublicId?: string; stage: string };
};
const progressPath = resolve(corpusRoot, 'indexing-progress.json');
let stage = 'configuration';
let activeDocument: string | undefined;
let progress: Progress | undefined;
let hasLock = false;
let readOnly = false;
function saveProgress() {
  if (!progress) return;
  progress.lastEvent = {
    at: new Date().toISOString(),
    documentPublicId: activeDocument,
    stage,
  };
  saveLockedProgress(progressPath, JSON.stringify(progress, null, 2) + '\n', {
    hasLock,
    readOnly,
  });
}
function unwrap<T>(result: { isErr(): boolean; value?: T }): T {
  if (result.isErr()) throw new Error(`Operation failed at ${stage}.`);
  return result.value!;
}

async function main() {
  config({ quiet: true });
  // Infrastructure errors can include URLs/headers. Journal only safe stage names.
  Logger.overrideLogger(false);
  const { values } = parseArgs({
    options: {
      user: { type: 'string', default: '10000000-0000-4000-8000-000000000001' },
      'delay-ms': { type: 'string', default: '30000' },
      limit: { type: 'string', default: '100' },
      'verify-only': { type: 'boolean', default: false },
    },
  });
  const delay = Number(values['delay-ms']),
    limit = Number(values.limit);
  if (
    !Number.isInteger(delay) ||
    delay < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new Error('Invalid delay or limit.');
  const corpus = loadCorpus();
  const cfg = new ConfigService();
  const model = cfg.getOrThrow<string>('GEMINI_EMBEDDING_MODEL');
  cfg.getOrThrow<string>('GEMINI_API_KEY');
  readOnly = values['verify-only'];
  const db = new PrismaService();
  const lock = new Client({ connectionString: process.env.DATABASE_URL });
  const storage = new S3FileStorage(cfg);
  const uploader = new S3Client({
    region: 'auto',
    endpoint: cfg.getOrThrow<string>('S3_API_ENDPOINT'),
    credentials: {
      accessKeyId: cfg.getOrThrow<string>('S3_ACCESS_KEY_ID'),
      secretAccessKey: cfg.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    maxAttempts: 1,
  });
  const chunker = new ChunkingService();
  const embeddings = new GeminiEmbeddingClient(cfg);
  const repo = new DocumentChunkRepository(db);
  let stopped = false;
  let interruptSleep: (() => void) | undefined;
  const stop = () => {
    stopped = true;
    interruptSleep?.();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    stage = 'database-lock';
    await lock.connect();
    const locked = await lock.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [corpus.knowledgeSpacePublicId],
    );
    if (!locked.rows[0].locked) throw new Error('Another seed is running.');
    hasLock = true;
    try {
      progress = JSON.parse(readFileSync(progressPath, 'utf8')) as Progress;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      progress = {
        version: 1,
        knowledgeSpacePublicId: corpus.knowledgeSpacePublicId,
        documents: {},
      };
    }
    if (
      progress.version !== 1 ||
      progress.knowledgeSpacePublicId !== corpus.knowledgeSpacePublicId
    )
      throw new Error('Progress belongs to another corpus.');

    await db.onModuleInit();
    stage = 'space-membership';
    const admin = await db.user.findUniqueOrThrow({
      where: { publicId: values.user },
    });
    if (admin.role !== 'Admin')
      throw new Error('Benchmark user must be admin.');
    let space = await db.knowledgeSpace.findUnique({
      where: { publicId: corpus.knowledgeSpacePublicId },
    });
    if (!space && !values['verify-only']) {
      const collision = await db.knowledgeSpace.findFirst({
        where: { name: corpus.spaceName },
      });
      if (collision)
        throw new Error('Space name already belongs to another ID.');
      const type = await db.knowledgeSpaceType.findUniqueOrThrow({
        where: { name: 'Engineering' },
      });
      space = await db.knowledgeSpace.create({
        data: {
          publicId: corpus.knowledgeSpacePublicId,
          name: corpus.spaceName,
          description: corpus.description,
          typeId: type.id,
        },
      });
    }
    if (
      !space ||
      space.name !== corpus.spaceName ||
      space.description !== corpus.description
    )
      throw new Error('Space missing or modified.');
    const membershipKey = { userId: admin.id, knowledgeSpaceId: space.id };
    let member = await db.userWorkspace.findUnique({
      where: { unique_user_workspace_per_space: membershipKey },
    });
    if (!member && !values['verify-only'])
      member = await db.userWorkspace.create({
        data: { ...membershipKey, role: 'Owner' },
      });
    if (member?.role !== 'Owner')
      throw new Error('Owner membership missing or modified.');
    const categories = new Map<string, number>();
    for (const doc of corpus.documents) {
      if (categories.has(doc.topic)) continue;
      const key = { name: doc.topicName, knowledgeSpaceId: space.id };
      let category = await db.category.findUnique({
        where: { unique_category_name_per_workspace: key },
      });
      if (!category && !values['verify-only'])
        category = await db.category.create({ data: key });
      if (!category) throw new Error('Category missing.');
      categories.set(doc.topic, category.id);
    }
    if (
      (await db.category.count({ where: { knowledgeSpaceId: space.id } })) !==
      10
    )
      throw new Error('Unexpected category count.');
    const sourceChunks = new Map<string, StoredChunk[]>();
    let indexed = 0,
      skipped = 0;
    let lastEmbeddingAt = 0;
    for (const entry of corpus.documents) {
      if (stopped) break;
      activeDocument = entry.publicId;
      const bytes = readFileSync(resolve(corpusRoot, entry.path));
      const expected = {
        publicId: entry.publicId,
        title: entry.title,
        content: bytes.toString('utf8'),
        fileSize: bytes.length,
        storagePath: `benchmarks/test-rag/${entry.publicId}/${entry.sha256}.md`,
        categoryId: categories.get(entry.topic)!,
        knowledgeSpaceId: space.id,
        authorId: admin.id,
      };
      stage = 'document-metadata';
      let doc = await db.document.findUnique({
        where: { publicId: entry.publicId },
      });
      if (!doc && !values['verify-only']) {
        // Reserve the deterministic object key before upload to make crashes resumable.
        doc = await db.document.create({
          data: {
            ...expected,
            fileSize: BigInt(bytes.length),
            fileType: 'MD',
            visibility: 'Public',
            status: 'Processing',
            description: 'Tài liệu nội bộ giả lập cho benchmark Test RAG.',
            storageKeys: { create: { key: expected.storagePath } },
          },
        });
      }
      if (!doc) throw new Error('Document missing.');
      assertDocumentMatches(doc, expected);
      const reserved = await db.documentStorageKey.findUnique({
        where: { key: doc.storagePath },
      });
      if (reserved?.documentId !== doc.id)
        throw new Error('Storage key reservation mismatch.');
      let audit = progress.documents[doc.publicId];
      if (!audit) {
        if (doc.status !== 'Processing' || values['verify-only'])
          throw new Error('Missing real embedding provenance.');
        audit = {
          sha256: entry.sha256,
          model,
          aiMock: false,
          client: 'GeminiEmbeddingClient',
          phase: 'prepared',
          preparedVersion: doc.updatedAt.toISOString(),
        };
        progress.documents[doc.publicId] = audit;
        saveProgress();
      }
      if (
        audit.sha256 !== entry.sha256 ||
        audit.model !== model ||
        audit.aiMock !== false ||
        audit.client !== 'GeminiEmbeddingClient'
      )
        throw new Error('Embedding provenance mismatch.');
      if (
        doc.status !== 'Ready' &&
        doc.updatedAt.toISOString() !== audit.preparedVersion
      )
        throw new Error('Pending document modified; refusing overwrite.');
      stage = 'storage';
      const metadata = unwrap(await storage.GetObjectMetadata(doc.storagePath));
      if (!metadata) {
        if (values['verify-only'] || doc.status === 'Ready')
          throw new Error('Stored file missing.');
        await uploader.send(
          new PutObjectCommand({
            Bucket: cfg.getOrThrow<string>('S3_BUCKET_NAME'),
            Key: doc.storagePath,
            Body: bytes,
            ContentType: 'text/markdown; charset=utf-8',
            ContentLength: bytes.length,
            IfNoneMatch: '*',
          }),
        );
      } else if (
        metadata.contentLength !== bytes.length ||
        !metadata.contentType?.startsWith('text/markdown')
      ) {
        throw new Error('Stored metadata changed; refusing overwrite.');
      }
      const stored = unwrap(await storage.GetObject(doc.storagePath));
      if (hash(stored) !== entry.sha256)
        throw new Error('Stored content changed; refusing overwrite.');
      const chunks = chunker.chunkText(expected.content);
      const chunksSha256 = hash(JSON.stringify(chunks));
      if (!chunks.length || chunks.length > 100)
        throw new Error('Unexpected chunk count.');
      if (doc.status === 'Ready') {
        stage = 'verify-ready';
        if (
          !audit.vectorsSha256 ||
          audit.chunksSha256 !== chunksSha256 ||
          (audit.committedVersion &&
            audit.committedVersion !== doc.updatedAt.toISOString())
        )
          throw new Error('Ready document lacks matching indexing provenance.');
        skipped++;
      } else {
        if (values['verify-only'] || doc.status !== 'Processing')
          throw new Error('Document is not Ready/Processing.');
        const remaining = Math.max(0, lastEmbeddingAt + delay - Date.now());
        if (remaining)
          await new Promise<void>((done) => {
            const timer = setTimeout(done, remaining);
            interruptSleep = () => {
              clearTimeout(timer);
              done();
            };
          });
        interruptSleep = undefined;
        if (stopped) break;
        stage = 'gemini-embedding';
        saveProgress();
        const vectors = unwrap(
          await embeddings.generateEmbeddings(
            chunks.map((c) => c.content),
            'RETRIEVAL_DOCUMENT',
          ),
        );
        assertEmbeddings(vectors, chunks.length);
        lastEmbeddingAt = Date.now();
        audit.phase = 'embedded';
        audit.embeddedAt = new Date().toISOString();
        audit.chunksSha256 = chunksSha256;
        audit.vectorsSha256 = vectorHash(vectors);
        audit.chunkCount = chunks.length;
        saveProgress();
        stage = 'persist-chunks';
        const committed = unwrap(
          await repo.addChunks({
            documentId: doc.id,
            knowledgeSpaceId: space.id,
            expectedUpdatedAt: doc.updatedAt,
            embeddingResult: chunks.map((chunk, i) => ({
              ...chunk,
              embedding: vectors[i],
            })),
          }),
        );
        if (!committed) throw new Error('Document changed while indexing.');
        audit.phase = 'ready';
        audit.committedVersion = committed.toISOString();
        saveProgress();
        indexed++;
      }
      stage = 'verify-chunks';
      const rows = await db.$queryRaw<
        (StoredChunk & { embedding: string; knowledgeSpaceId: number })[]
      >`
        SELECT chunk_index AS "chunkIndex", content_chunk AS "contentChunk", token_count AS "tokenCount", embedding::text AS embedding, knowledge_space_id AS "knowledgeSpaceId"
        FROM document_chunk WHERE document_id = ${doc.id} ORDER BY chunk_index`;
      if (
        rows.length !== chunks.length ||
        rows.some(
          (c, i) =>
            c.chunkIndex !== i ||
            c.contentChunk !== chunks[i].content ||
            c.tokenCount !== chunks[i].tokens ||
            c.knowledgeSpaceId !== space.id,
        )
      )
        throw new Error('Stored chunks differ from corpus.');
      const storedVectors = rows.map(
        (row) => JSON.parse(row.embedding) as number[],
      );
      assertEmbeddings(storedVectors, chunks.length);
      if (vectorHash(storedVectors) !== audit.vectorsSha256)
        throw new Error('Stored vectors differ from real Gemini result.');
      sourceChunks.set(
        doc.publicId,
        rows.map(({ chunkIndex, contentChunk, tokenCount }) => ({
          chunkIndex,
          contentChunk,
          tokenCount,
        })),
      );
      console.log(
        `${entry.id}: ${doc.status === 'Ready' ? 'verified, skipped' : 'indexed'} (${chunks.length} chunks); ${sourceChunks.size}/100`,
      );
      if (indexed >= limit) break;
    }
    if (sourceChunks.size === 100) {
      stage = 'finalize-dataset';
      // Earlier per-document checks can be stale after a long indexing run.
      // Freeze metadata, membership and every chunk in one consistent snapshot.
      const snapshot = await db.$transaction(
        async (tx) => {
          const currentSpace = await tx.knowledgeSpace.findUniqueOrThrow({
            where: { id: space.id },
          });
          const currentMember = await tx.userWorkspace.findUnique({
            where: { unique_user_workspace_per_space: membershipKey },
          });
          const currentCategories = await tx.category.findMany({
            where: { knowledgeSpaceId: space.id },
          });
          const documents = await tx.document.findMany({
            where: { knowledgeSpaceId: space.id },
          });
          const rows = await tx.$queryRaw<
            (StoredChunk & {
              documentId: number;
              embedding: string;
              knowledgeSpaceId: number;
            })[]
          >`
          SELECT document_id AS "documentId", chunk_index AS "chunkIndex", content_chunk AS "contentChunk", token_count AS "tokenCount", embedding::text AS embedding, knowledge_space_id AS "knowledgeSpaceId"
          FROM document_chunk WHERE knowledge_space_id = ${space.id} ORDER BY document_id, chunk_index`;
          return {
            currentSpace,
            currentMember,
            currentCategories,
            documents,
            rows,
          };
        },
        { isolationLevel: 'RepeatableRead', timeout: 30_000 },
      );
      if (
        snapshot.documents.length !== 100 ||
        snapshot.currentCategories.length !== 10 ||
        snapshot.currentMember?.role !== 'Owner' ||
        snapshot.currentSpace.name !== corpus.spaceName ||
        snapshot.currentSpace.description !== corpus.description
      )
        throw new Error('Final snapshot space, membership or count mismatch.');
      const byId = new Map(snapshot.documents.map((d) => [d.publicId, d]));
      const frozenChunks = new Map<string, StoredChunk[]>();
      for (const entry of corpus.documents) {
        const doc = byId.get(entry.publicId);
        const audit = progress.documents[entry.publicId];
        if (!doc || !audit)
          throw new Error('Final snapshot document/provenance missing.');
        const content = readFileSync(resolve(corpusRoot, entry.path), 'utf8');
        assertDocumentMatches(doc, {
          publicId: entry.publicId,
          title: entry.title,
          content,
          fileSize: entry.fileSize,
          storagePath: `benchmarks/test-rag/${entry.publicId}/${entry.sha256}.md`,
          categoryId: categories.get(entry.topic)!,
          knowledgeSpaceId: space.id,
          authorId: admin.id,
        });
        assertReadyVersion(doc, audit.committedVersion);
        if (
          !snapshot.currentCategories.some(
            (c) => c.id === doc.categoryId && c.name === entry.topicName,
          )
        )
          throw new Error('Final snapshot category changed.');
        const expectedChunks = chunker.chunkText(content);
        const rows = snapshot.rows.filter((row) => row.documentId === doc.id);
        if (
          audit.chunksSha256 !== hash(JSON.stringify(expectedChunks)) ||
          rows.length !== expectedChunks.length ||
          rows.some(
            (c, i) =>
              c.chunkIndex !== i ||
              c.contentChunk !== expectedChunks[i].content ||
              c.tokenCount !== expectedChunks[i].tokens,
          )
        )
          throw new Error('Final snapshot chunks changed.');
        const vectors = rows.map(
          (row) => JSON.parse(row.embedding) as number[],
        );
        assertEmbeddings(vectors, expectedChunks.length);
        if (vectorHash(vectors) !== audit.vectorsSha256)
          throw new Error('Final snapshot vectors changed.');
        frozenChunks.set(
          doc.publicId,
          rows.map(({ chunkIndex, contentChunk, tokenCount }) => ({
            chunkIndex,
            contentChunk,
            tokenCount,
          })),
        );
      }
      writeDataset(corpus, frozenChunks);
      stage = 'complete';
      console.log(
        `Verified 100 Ready documents and 20 questions; indexed ${indexed}, skipped ${skipped}; Gemini model ${model}, aiMock=false.`,
      );
    } else {
      stage = 'paused-at-boundary';
      console.log(
        `Stopped at document boundary: indexed ${indexed}, skipped ${skipped}. Re-run to continue. No benchmark answers collected.`,
      );
    }
    if (!values['verify-only']) saveProgress();
  } catch (error) {
    stage = `failed:${stage}`;
    try {
      saveProgress();
    } catch {
      /* Keep the original failure. */
    }
    throw error;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    storage.onModuleDestroy();
    uploader.destroy();
    await db.onModuleDestroy();
    await lock.end();
    hasLock = false;
  }
}
void main().catch(() => {
  console.error(
    `Seed stopped at ${stage}${activeDocument ? ` for ${activeDocument}` : ''}; see indexing-progress.json. No automatic AI retry. Connection details and credentials are omitted.`,
  );
  process.exitCode = 1;
});
