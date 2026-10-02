import { buildSimilarChunksCacheKey } from './chat-answer.service';

const input = {
  knowledgeSpaceId: 7,
  userId: 12,
  questionEmbedding: [0.1, -0.2, 0.3],
  model: 'gemini-embedding-001',
  taskType: 'RETRIEVAL_QUERY',
  topK: 5,
  corpusVersion: 'version-a',
};

describe('buildSimilarChunksCacheKey', () => {
  it('is stable and keeps the vector out of the Redis key', () => {
    const key = buildSimilarChunksCacheKey(input);
    expect(buildSimilarChunksCacheKey({ ...input })).toBe(key);
    expect(key).toContain('rag:similar-chunks:v1:7:12:version-a:');
    expect(key).not.toContain('0.1');
    expect(key.length).toBeLessThan(150);
  });

  it.each([
    { knowledgeSpaceId: 8 },
    { userId: 13 },
    { questionEmbedding: [0.1, -0.2, 0.4] },
    { model: 'next-model' },
    { taskType: 'RETRIEVAL_DOCUMENT' },
    { topK: 10 },
    { corpusVersion: 'version-b' },
  ])(
    'changes when a search input or visibility scope changes: %p',
    (change) => {
      expect(buildSimilarChunksCacheKey({ ...input, ...change })).not.toBe(
        buildSimilarChunksCacheKey(input),
      );
    },
  );
});
