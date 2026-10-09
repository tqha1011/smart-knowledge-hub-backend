import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ChunkingService } from '../../src/modules/rag/application/services/chunking-service';
import {
  loadCorpus,
  assertDocumentMatches,
  assertEmbeddings,
  buildQuestions,
  saveLockedProgress,
  assertReadyVersion,
} from './test-rag-lib';

void test('final snapshot rejects a document edited and reindexed after its earlier verification', () => {
  const version = '2026-10-08T14:00:00.000Z';
  assert.doesNotThrow(() =>
    assertReadyVersion(
      { status: 'Ready', updatedAt: new Date(version) },
      version,
    ),
  );
  assert.throws(
    () =>
      assertReadyVersion(
        { status: 'Ready', updatedAt: new Date('2026-10-08T14:05:00.000Z') },
        version,
      ),
    /version/i,
  );
});

void test('a rejected competing seed and read-only verification cannot overwrite provenance', () => {
  const path = resolve(
    mkdtempSync(resolve(tmpdir(), 'rag-journal-')),
    'progress.json',
  );
  writeFileSync(path, 'active provenance');
  saveLockedProgress(path, 'stale provenance', {
    hasLock: false,
    readOnly: false,
  });
  assert.equal(readFileSync(path, 'utf8'), 'active provenance');
  saveLockedProgress(path, 'verification failure', {
    hasLock: true,
    readOnly: true,
  });
  assert.equal(readFileSync(path, 'utf8'), 'active provenance');
  saveLockedProgress(path, 'new provenance', {
    hasLock: true,
    readOnly: false,
  });
  assert.equal(readFileSync(path, 'utf8'), 'new provenance');
});

void test('corpus has 100 distinct complete Vietnamese files across 10 topics', () => {
  const corpus = loadCorpus();
  assert.equal(corpus.documents.length, 100);
  assert.equal(new Set(corpus.documents.map((d) => d.sha256)).size, 100);
  const counts = new Map<string, number>();
  for (const doc of corpus.documents) {
    counts.set(doc.topic, (counts.get(doc.topic) ?? 0) + 1);
    const text = readFileSync(
      resolve(__dirname, 'corpus/test-rag', doc.path),
      'utf8',
    );
    assert.match(text, /giả lập/);
    assert.ok(doc.wordCount >= 800 && doc.wordCount <= 1200);
  }
  assert.equal(counts.size, 10);
  assert.ok([...counts.values()].every((count) => count === 10));
});

void test('resume refuses a modified document even when Ready', () => {
  const entry = {
    publicId: 'd',
    title: 'Guide.md',
    content: 'original',
    fileSize: 8,
    storagePath: 's',
    categoryId: 3,
    knowledgeSpaceId: 4,
    authorId: 5,
  };
  const doc = {
    ...entry,
    fileSize: 8n,
    fileType: 'MD',
    visibility: 'Public',
    isDeleted: false,
  };
  assert.doesNotThrow(() => assertDocumentMatches(doc, entry));
  for (const patch of [
    { content: 'edited' },
    { fileSize: 9n },
    { storagePath: 'other' },
    { visibility: 'Restricted' },
    { isDeleted: true },
    { title: 'renamed' },
    { categoryId: 9 },
    { authorId: 9 },
  ]) {
    assert.throws(
      () => assertDocumentMatches({ ...doc, ...patch }, entry),
      /modified/,
    );
  }
});

void test('rejects missing, wrong-dimensional, nonfinite or zero embeddings', () => {
  const vector = Array.from({ length: 1536 }, (_, i) => i / 1536);
  assert.doesNotThrow(() => assertEmbeddings([vector], 1));
  for (const vectors of [
    [],
    [vector.slice(1)],
    [[...vector.slice(0, -1), NaN]],
    [Array.from({ length: 1536 }, () => 0)],
  ]) {
    assert.throws(() => assertEmbeddings(vectors, 1), /embedding/i);
  }
});

void test('questions require database chunks; synthesis cites multiple chunks', () => {
  const corpus = loadCorpus();
  assert.throws(() => buildQuestions(corpus, new Map()), /chunk/i);
});

void test('all 20 blueprints fit real chunk boundaries with the required distribution', () => {
  const corpus = loadCorpus();
  const chunker = new ChunkingService();
  const chunks = new Map(
    corpus.documents.map((doc) => [
      doc.publicId,
      chunker
        .chunkText(
          readFileSync(resolve(__dirname, 'corpus/test-rag', doc.path), 'utf8'),
        )
        .map((c) => ({
          chunkIndex: c.chunkIndex,
          contentChunk: c.content,
          tokenCount: c.tokens,
        })),
    ]),
  );
  const questions = buildQuestions(corpus, chunks);
  assert.deepEqual(
    questions.map((q) => q.id),
    Array.from({ length: 20 }, (_, i) => `Q${31 + i}`),
  );
  assert.equal(
    new Set(questions.map((q) => q.evidence[0].documentPublicId)).size,
    20,
  );
  const distribution = corpus.documents
    .filter((d) => d.benchmark)
    .map((d) => d.benchmark!.type);
  assert.deepEqual(
    ['lookup', 'scenario', 'synthesis'].map(
      (t) => distribution.filter((v) => v === t).length,
    ),
    [8, 8, 4],
  );
  for (const q of questions.slice(-4))
    assert.ok(new Set(q.evidence.map((e) => e.chunkIndex)).size >= 2);
});
