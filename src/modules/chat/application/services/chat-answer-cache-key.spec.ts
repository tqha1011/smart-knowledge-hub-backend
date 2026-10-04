import { buildSimilarChunksCacheKey } from './chat-answer.service';

const input = {
  knowledgeSpaceId: 7,
  questionEmbedding: [0.1, -0.2, 0.3],
  model: 'gemini-embedding-001',
  taskType: 'RETRIEVAL_QUERY',
  topK: 5,
  corpusVersion: 'version-a',
};

describe('buildSimilarChunksCacheKey', () => {
  it('shares the Public key across users, but scopes Restricted by user', () => {
    const publicKey = buildSimilarChunksCacheKey({
      ...input,
      visibility: 'Public',
    });
    const restrictedKey = buildSimilarChunksCacheKey({
      ...input,
      visibility: 'Restricted',
      userId: 12,
    });
    expect(publicKey).toContain('rag:similar-chunks:v2:7:Public:version-a:');
    expect(publicKey).not.toContain(':12:');
    expect(restrictedKey).toContain(
      'rag:similar-chunks:v2:7:Restricted:12:version-a:',
    );
    expect(
      buildSimilarChunksCacheKey({
        ...input,
        visibility: 'Restricted',
        userId: 13,
      }),
    ).not.toBe(restrictedKey);
    expect(publicKey).not.toContain('0.1');
    expect(publicKey).not.toBe(restrictedKey);
  });

  it.each([
    { knowledgeSpaceId: 8 },
    { questionEmbedding: [0.1, -0.2, 0.4] },
    { model: 'next-model' },
    { taskType: 'RETRIEVAL_DOCUMENT' },
    { topK: 10 },
    { corpusVersion: 'version-b' },
  ])(
    'changes when a search input or visibility scope changes: %p',
    (change) => {
      expect(
        buildSimilarChunksCacheKey({
          ...input,
          visibility: 'Public',
          ...change,
        }),
      ).not.toBe(
        buildSimilarChunksCacheKey({ ...input, visibility: 'Public' }),
      );
    },
  );
});
