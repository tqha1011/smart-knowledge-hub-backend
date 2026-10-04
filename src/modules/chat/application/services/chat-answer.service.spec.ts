import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import { IAnswerGenerationClient } from 'src/modules/rag/domain/repositories/answer-generation-client.interface';
import { IDocumentChunkRepository } from 'src/modules/rag/domain/repositories/document-chunk.repo.interface';
import { IEmbeddingClient } from 'src/modules/rag/domain/repositories/embedding-client.interface';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import {
  buildQuestionEmbeddingCacheKey,
  ChatAnswerService,
} from './chat-answer.service';

const embedding = Array.from({ length: 1536 }, () => 0.1);
const chunk = {
  chunkId: 31,
  documentId: 21,
  documentPublicId: 'document-public-id',
  documentTitle: 'Guide',
  content: 'The guide content',
  score: 0.9,
  visibility: 'Public' as const,
};
const restrictedChunk = {
  ...chunk,
  chunkId: 32,
  documentId: 22,
  documentPublicId: 'restricted-document',
  documentTitle: 'Private guide',
  score: 0.95,
  visibility: 'Restricted' as const,
};

describe('ChatAnswerService question embedding cache', () => {
  const values = new Map<string, string>();
  const cache = {
    get: jest.fn((key: string) => Promise.resolve(values.get(key))),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    delete: jest.fn(),
  };
  const embeddingClient = { generateEmbeddings: jest.fn() };
  const chunks = {
    searchSimilarChunks: jest.fn(),
    validateSimilarChunks: jest.fn(),
  };
  const answerClient = { generateAnswer: jest.fn() };
  const config = { getOrThrow: jest.fn() };
  let model: string;
  let service: ChatAnswerService;
  let warning: jest.SpyInstance;

  it('does not send cached deleted or unauthorized chunks to the LLM', async () => {
    chunks.searchSimilarChunks.mockResolvedValue(ok([chunk, restrictedChunk]));
    answerClient.generateAnswer.mockResolvedValue(ok('answer'));
    await service.generateAnswer(7, 8, 'question');
    answerClient.generateAnswer.mockClear();
    chunks.validateSimilarChunks.mockResolvedValueOnce(ok([]));
    expect(
      (await service.generateAnswer(7, 8, 'question'))._unsafeUnwrap(),
    ).toMatchObject({ answered: false });
    expect(answerClient.generateAnswer).not.toHaveBeenCalled();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    values.clear();
    model = 'gemini-embedding-001';
    cache.get
      .mockReset()
      .mockImplementation((key: string) => Promise.resolve(values.get(key)));
    cache.set.mockReset().mockImplementation((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    });
    config.getOrThrow.mockImplementation(() => model);
    embeddingClient.generateEmbeddings.mockResolvedValue(ok([embedding]));
    chunks.searchSimilarChunks.mockResolvedValue(ok([]));
    chunks.validateSimilarChunks.mockImplementation(
      (_s, _u, entries: unknown[]) => Promise.resolve(ok(entries)),
    );
    warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const module = await Test.createTestingModule({
      providers: [
        ChatAnswerService,
        { provide: IEmbeddingClient, useValue: embeddingClient },
        { provide: IDocumentChunkRepository, useValue: chunks },
        { provide: IAnswerGenerationClient, useValue: answerClient },
        { provide: ConfigService, useValue: config },
        { provide: IApplicationCache, useValue: cache },
      ],
    }).compile();
    service = module.get(ChatAnswerService);
  });
  afterEach(() => jest.restoreAllMocks());

  it('reuses a valid vector for an identical question across workspaces, and still runs retrieval', async () => {
    expect(
      (await service.generateAnswer(7, 12, 'Where is the guide?')).isOk(),
    ).toBe(true);
    expect(
      (await service.generateAnswer(8, 13, 'Where is the guide?')).isOk(),
    ).toBe(true);
    expect(embeddingClient.generateEmbeddings).toHaveBeenCalledTimes(1);
    expect(chunks.searchSimilarChunks).toHaveBeenCalledTimes(2);
    expect(chunks.searchSimilarChunks).toHaveBeenNthCalledWith(
      2,
      8,
      13,
      embedding,
      5,
      { public: true, restricted: true },
    );
    const key = [...values.keys()][0];
    expect(key).toMatch(
      /^rag:question-embedding:v1:gemini-embedding-001:RETRIEVAL_QUERY:1536:[a-f0-9]{64}$/,
    );
    expect(key).not.toContain('Where is the guide?');
    expect(cache.set).toHaveBeenCalledWith(key, JSON.stringify(embedding));
  });

  it('misses for different question text or model', async () => {
    await service.generateAnswer(7, 12, 'Guide?');
    await service.generateAnswer(7, 12, 'Guide? ');
    model = 'new-embedding-model';
    await service.generateAnswer(7, 12, 'Guide?');
    expect(embeddingClient.generateEmbeddings).toHaveBeenCalledTimes(3);
    expect(
      [...values.keys()].filter((key) =>
        key.startsWith('rag:question-embedding:'),
      ),
    ).toHaveLength(3);
  });

  it.each(['broken JSON', 'wrong dimension', 'non-finite value'])(
    'regenerates %s cache entries',
    async (kind) => {
      await service.generateAnswer(7, 12, 'Guide?');
      const key = [...values.keys()][0];
      values.set(
        key,
        kind === 'broken JSON'
          ? '{bad'
          : kind === 'wrong dimension'
            ? '[0.1]'
            : JSON.stringify([null, ...embedding.slice(1)]),
      );
      await service.generateAnswer(7, 12, 'Guide?');
      expect(embeddingClient.generateEmbeddings).toHaveBeenCalledTimes(2);
      expect(chunks.searchSimilarChunks).toHaveBeenLastCalledWith(
        7,
        12,
        embedding,
        5,
        { public: true, restricted: true },
      );
      expect(warning).toHaveBeenCalled();
    },
  );

  it('falls back to Gemini if reading the cache fails', async () => {
    cache.get.mockRejectedValueOnce(new Error('Redis unavailable'));
    expect((await service.generateAnswer(7, 12, 'Guide?')).isOk()).toBe(true);
    expect(embeddingClient.generateEmbeddings).toHaveBeenCalledTimes(1);
    expect(chunks.searchSimilarChunks).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalled();
  });

  it('reuses valid cached chunks for the same user and question', async () => {
    chunks.searchSimilarChunks.mockResolvedValue(ok([chunk]));
    answerClient.generateAnswer.mockResolvedValue(ok('Answer'));

    const first = await service.generateAnswer(7, 12, 'Guide?');
    const second = await service.generateAnswer(7, 12, 'Guide?');

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(chunks.searchSimilarChunks).toHaveBeenCalledTimes(1);
    if (second.isOk() && second.value.answered) {
      expect(second.value.sources[0].documentPublicId).toBe(
        'document-public-id',
      );
    }
  });

  it('queries the database when cached chunks are malformed', async () => {
    chunks.searchSimilarChunks.mockResolvedValue(ok([chunk]));
    answerClient.generateAnswer.mockResolvedValue(ok('Answer'));
    await service.generateAnswer(7, 12, 'Guide?');
    const key = [...values.keys()].find((value) =>
      value.startsWith('rag:similar-chunks:'),
    );
    expect(key).toBeDefined();
    values.set(key!, JSON.stringify([{ ...chunk, score: 'invalid' }]));

    const result = await service.generateAnswer(7, 12, 'Guide?');

    expect(result.isOk()).toBe(true);
    expect(chunks.searchSimilarChunks).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalled();
  });

  it('does not share Restricted chunks between users', async () => {
    chunks.searchSimilarChunks.mockImplementation(
      (_spaceId: number, userId: number) =>
        Promise.resolve(ok(userId === 12 ? [restrictedChunk] : [])),
    );
    answerClient.generateAnswer.mockResolvedValue(ok('Answer'));

    const first = await service.generateAnswer(7, 12, 'Guide?');
    const second = await service.generateAnswer(7, 13, 'Guide?');

    expect(first.isOk() && first.value.answered).toBe(true);
    expect(second.isOk() && second.value.answered).toBe(false);
    expect(chunks.searchSimilarChunks).toHaveBeenCalledTimes(2);
  });

  it('queries again after the workspace retrieval version changes', async () => {
    chunks.searchSimilarChunks
      .mockResolvedValueOnce(ok([chunk]))
      .mockResolvedValueOnce(ok([]));
    answerClient.generateAnswer.mockResolvedValue(ok('Answer'));

    const first = await service.generateAnswer(7, 12, 'Guide?');
    values.set('rag:similar-chunks:version:7', 'new-version');
    const second = await service.generateAnswer(7, 12, 'Guide?');

    expect(first.isOk() && first.value.answered).toBe(true);
    expect(second.isOk() && second.value.answered).toBe(false);
    expect(chunks.searchSimilarChunks).toHaveBeenCalledTimes(2);
  });

  it('bypasses the chunk cache when the version cannot be read', async () => {
    values.set(
      buildQuestionEmbeddingCacheKey('Guide?', model),
      JSON.stringify(embedding),
    );
    cache.get
      .mockImplementationOnce((key: string) => Promise.resolve(values.get(key)))
      .mockRejectedValueOnce(new Error('Redis unavailable'));

    const result = await service.generateAnswer(7, 12, 'Guide?');

    expect(result.isOk()).toBe(true);
    expect(chunks.searchSimilarChunks).toHaveBeenCalledTimes(1);
    expect(
      [...values.keys()].filter((key) =>
        key.startsWith('rag:similar-chunks:v2:'),
      ),
    ).toHaveLength(0);
    expect(warning).toHaveBeenCalled();
  });

  it('answers from database chunks when writing their cache entry fails', async () => {
    values.set(
      buildQuestionEmbeddingCacheKey('Guide?', model),
      JSON.stringify(embedding),
    );
    chunks.searchSimilarChunks.mockResolvedValue(ok([chunk]));
    answerClient.generateAnswer.mockResolvedValue(ok('Answer'));
    cache.set.mockRejectedValueOnce(new Error('Redis unavailable'));

    const result = await service.generateAnswer(7, 12, 'Guide?');

    expect(result.isOk() && result.value.answered).toBe(true);
    expect(chunks.searchSimilarChunks).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalled();
  });

  it('does not fail the answer if writing the cache fails', async () => {
    cache.set.mockRejectedValueOnce(new Error('Redis unavailable'));
    expect((await service.generateAnswer(7, 12, 'Guide?')).isOk()).toBe(true);
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringMatching(/^rag:similar-chunks:v2:7:Restricted:12:/),
      JSON.stringify([]),
      60_000,
    );
    expect(chunks.searchSimilarChunks).toHaveBeenCalledWith(
      7,
      12,
      embedding,
      5,
      { public: true, restricted: true },
    );
    expect(warning).toHaveBeenCalled();
  });

  it('does not cache an embedding error', async () => {
    embeddingClient.generateEmbeddings.mockResolvedValue(
      err(new Error('Gemini unavailable')),
    );
    expect((await service.generateAnswer(7, 12, 'Guide?')).isErr()).toBe(true);
    expect(cache.set).not.toHaveBeenCalled();
    expect(chunks.searchSimilarChunks).not.toHaveBeenCalled();
  });

  it('shares Public results across users while fetching each user’s Restricted results', async () => {
    chunks.searchSimilarChunks.mockImplementation(
      (
        _spaceId: number,
        userId: number,
        _vector: number[],
        _topK: number,
        scopes: { public: boolean; restricted: boolean },
      ) =>
        Promise.resolve(
          ok([
            ...(scopes.public ? [chunk] : []),
            ...(scopes.restricted && userId === 12 ? [restrictedChunk] : []),
          ]),
        ),
    );
    answerClient.generateAnswer.mockResolvedValue(ok('Answer'));

    const first = await service.generateAnswer(7, 12, 'Guide?');
    const second = await service.generateAnswer(7, 13, 'Guide?');

    expect(first.isOk() && first.value.answered).toBe(true);
    expect(second.isOk() && second.value.answered).toBe(true);
    if (second.isOk() && second.value.answered) {
      expect(
        second.value.sources.map((source) => source.documentPublicId),
      ).toEqual(['document-public-id']);
    }
    expect(chunks.searchSimilarChunks).toHaveBeenNthCalledWith(
      2,
      7,
      13,
      embedding,
      5,
      { public: false, restricted: true },
    );
    expect(
      [...values.keys()].filter((key) => key.includes(':Public:')),
    ).toHaveLength(1);
    expect(
      [...values.keys()].filter((key) => key.includes(':Restricted:')),
    ).toHaveLength(2);
  });

  it('merges both top K lists by score before generating the answer', async () => {
    chunks.searchSimilarChunks.mockResolvedValue(ok([chunk, restrictedChunk]));
    answerClient.generateAnswer.mockResolvedValue(ok('Answer'));

    const result = await service.generateAnswer(7, 12, 'Guide?');

    expect(result.isOk() && result.value.answered).toBe(true);
    if (result.isOk() && result.value.answered) {
      expect(
        result.value.sources.map((source) => source.documentPublicId),
      ).toEqual(['restricted-document', 'document-public-id']);
    }
    expect(chunks.searchSimilarChunks).toHaveBeenCalledWith(
      7,
      12,
      embedding,
      5,
      { public: true, restricted: true },
    );
  });

  it('reports actual cache outcomes for a miss followed by a hit', async () => {
    const first: Record<string, string> = {};
    const second: Record<string, string> = {};

    await service.generateAnswer(7, 12, 'Guide?', first);
    await service.generateAnswer(7, 12, 'Guide?', second);

    expect(first).toEqual({
      embedding: 'miss',
      publicChunks: 'miss',
      restrictedChunks: 'miss',
    });
    expect(second).toEqual({
      embedding: 'hit',
      publicChunks: 'hit',
      restrictedChunks: 'hit',
    });
  });

  it('reports bypass rather than miss when the cache version cannot be read', async () => {
    const diagnostics: Record<string, string> = {};
    cache.get.mockImplementation((key: string) =>
      key === 'rag:similar-chunks:version:7'
        ? Promise.reject(new Error('Redis unavailable'))
        : Promise.resolve(values.get(key)),
    );

    await service.generateAnswer(7, 12, 'Guide?', diagnostics);

    expect(diagnostics).toEqual({
      embedding: 'miss',
      publicChunks: 'bypass',
      restrictedChunks: 'bypass',
    });
  });
});
