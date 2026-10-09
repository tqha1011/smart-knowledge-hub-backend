import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

export const corpusRoot = resolve(__dirname, 'corpus/test-rag');
export const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

export function saveLockedProgress(
  path: string,
  contents: string,
  access: { hasLock: boolean; readOnly: boolean },
): void {
  if (!access.hasLock || access.readOnly) return;
  writeFileSync(path + '.tmp', contents);
  renameSync(path + '.tmp', path);
}
export type CorpusDocument = {
  id: string;
  publicId: string;
  topic: string;
  topicName: string;
  path: string;
  title: string;
  sha256: string;
  wordCount: number;
  fileSize: number;
  benchmark?: {
    id: string;
    type: 'lookup' | 'scenario' | 'synthesis';
    question: string;
    requiredFacts: string[];
  };
};
export type Corpus = {
  version: number;
  synthetic: boolean;
  knowledgeSpacePublicId: string;
  spaceName: string;
  description: string;
  documents: CorpusDocument[];
};
export type StoredChunk = {
  chunkIndex: number;
  contentChunk: string;
  tokenCount: number;
};

export function assertReadyVersion(
  doc: { status: string; updatedAt: Date },
  committedVersion?: string,
): void {
  if (doc.status !== 'Ready')
    throw new Error('Snapshot document is not Ready.');
  if (committedVersion && doc.updatedAt.toISOString() !== committedVersion)
    throw new Error('Snapshot document version changed after indexing.');
}

export function loadCorpus(): Corpus {
  const corpus = JSON.parse(
    readFileSync(resolve(corpusRoot, 'manifest.json'), 'utf8'),
  ) as Corpus;
  if (
    corpus.version !== 1 ||
    !corpus.synthetic ||
    corpus.documents.length !== 100
  )
    throw new Error('Expected synthetic corpus version 1 with 100 documents.');
  const paths = new Set<string>(),
    ids = new Set<string>(),
    hashes = new Set<string>();
  const topics = new Map<string, number>();
  for (const doc of corpus.documents) {
    if (!/^[a-z-]+\/\d{2}\.md$/.test(doc.path))
      throw new Error(`Invalid path: ${doc.id}`);
    const bytes = readFileSync(resolve(corpusRoot, doc.path));
    const text = bytes.toString('utf8');
    const count = text.trim().split(/\s+/u).length;
    if (
      hash(bytes) !== doc.sha256 ||
      bytes.length !== doc.fileSize ||
      count !== doc.wordCount ||
      count < 800 ||
      count > 1200 ||
      !text.includes('DỮ LIỆU GIẢ LẬP') ||
      paths.has(doc.path) ||
      ids.has(doc.publicId) ||
      hashes.has(doc.sha256)
    )
      throw new Error(`Corpus mismatch or duplicate: ${doc.id}`);
    paths.add(doc.path);
    ids.add(doc.publicId);
    hashes.add(doc.sha256);
    topics.set(doc.topic, (topics.get(doc.topic) ?? 0) + 1);
  }
  const files = readdirSync(corpusRoot, { recursive: true }).filter((p) =>
    String(p).endsWith('.md'),
  );
  if (
    files.length !== 100 ||
    topics.size !== 10 ||
    [...topics.values()].some((n) => n !== 10)
  )
    throw new Error('Expected 100 Markdown files and 10 topics of 10.');
  return corpus;
}

type ExpectedDocument = {
  publicId: string;
  title: string;
  content: string;
  fileSize: number;
  storagePath: string;
  categoryId: number;
  knowledgeSpaceId: number;
  authorId: number;
};
export function assertDocumentMatches(
  doc: Omit<ExpectedDocument, 'content' | 'fileSize'> & {
    content: string | null;
    fileSize: bigint;
    fileType: string;
    visibility: string;
    isDeleted: boolean;
  },
  expected: ExpectedDocument,
): void {
  const { fileSize, ...fields } = expected;
  if (
    Object.entries(fields).some(
      ([key, value]) => doc[key as keyof typeof fields] !== value,
    ) ||
    doc.fileSize !== BigInt(fileSize) ||
    doc.fileType !== 'MD' ||
    doc.visibility !== 'Public' ||
    doc.isDeleted
  )
    throw new Error(
      `Document modified: ${expected.publicId}; refusing overwrite.`,
    );
}
export function assertEmbeddings(vectors: number[][], count: number): void {
  if (
    vectors.length !== count ||
    vectors.some(
      (v) =>
        v.length !== 1536 ||
        v.some((n) => !Number.isFinite(n)) ||
        !v.some((n) => n !== 0),
    )
  )
    throw new Error(
      'Invalid embedding count, dimensions, values or zero vector.',
    );
}
// pgvector stores float32; fingerprint identical values before/after DB IO.
export const vectorHash = (vectors: number[][]) =>
  hash(JSON.stringify(vectors.map((v) => v.map(Math.fround))));

export function buildQuestions(
  corpus: Corpus,
  chunks: Map<string, StoredChunk[]>,
) {
  const questions = corpus.documents
    .filter((d) => d.benchmark)
    .map((doc) => {
      const b = doc.benchmark!;
      const evidence = b.requiredFacts.map((quote) => {
        const chunk = chunks
          .get(doc.publicId)
          ?.find((c) => c.contentChunk.includes(quote));
        if (!chunk)
          throw new Error(`${b.id}: database chunk missing evidence.`);
        return {
          documentPublicId: doc.publicId,
          documentTitle: doc.title,
          chunkIndex: chunk.chunkIndex,
          quote,
        };
      });
      if (
        b.type === 'synthesis' &&
        new Set(evidence.map((e) => e.chunkIndex)).size < 2
      )
        throw new Error(`${b.id}: synthesis needs multiple source chunks.`);
      return {
        id: b.id,
        knowledgeSpacePublicId: corpus.knowledgeSpacePublicId,
        question: b.question,
        expectedAnswer: b.requiredFacts.join(' '),
        requiredFacts: b.requiredFacts,
        evidence,
      };
    });
  if (
    questions.length !== 20 ||
    new Set(questions.map((q) => q.id)).size !== 20
  )
    throw new Error('Expected 20 distinct questions.');
  return questions;
}
export function writeDataset(
  corpus: Corpus,
  chunks: Map<string, StoredChunk[]>,
) {
  const questions = buildQuestions(corpus, chunks);
  const jsonl = questions.map((q) => JSON.stringify(q)).join('\n') + '\n';
  const md =
    [
      '# Test RAG — Q31–Q50',
      '**CORPUS GIẢ LẬP:** 100 tài liệu, 10 chủ đề; mọi số liệu và chính sách đều mô phỏng.',
      `Space: \`${corpus.knowledgeSpacePublicId}\`. Bằng chứng đọc từ chunks DB sau khi đủ 100 tài liệu Ready.`,
      '8 câu tra cứu, 8 câu tình huống, 4 câu tổng hợp nhiều đoạn trong cùng tài liệu. 20 tài liệu nguồn khác nhau; 80 tài liệu gây nhiễu. Chưa thu thập câu trả lời RAG hoặc chấm correctness.',
      ...questions.map((q) =>
        [
          `## ${q.id}`,
          `**Câu hỏi:** ${q.question}`,
          `**Đáp án:** ${q.expectedAnswer}`,
          '**Ý bắt buộc:**\n\n' +
            q.requiredFacts.map((f) => `- ${f}`).join('\n'),
          '**Bằng chứng nguyên văn:**\n\n' +
            q.evidence
              .map(
                (e) =>
                  `- ${e.documentTitle} — \`${e.documentPublicId}\`, chunk ${e.chunkIndex}:\n\n  > ${e.quote}`,
              )
              .join('\n\n'),
        ].join('\n\n'),
      ),
    ].join('\n\n') + '\n';
  for (const [name, content] of [
    ['test-rag-20.jsonl', jsonl],
    ['test-rag-20.md', md],
  ]) {
    const path = resolve(__dirname, name);
    try {
      if (readFileSync(path, 'utf8') !== content)
        throw new Error(`Dataset changed: ${name}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      writeFileSync(path, content, { flag: 'wx' });
    }
  }
  return questions;
}
