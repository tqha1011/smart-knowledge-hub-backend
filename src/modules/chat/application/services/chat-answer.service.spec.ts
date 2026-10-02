import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import { IAnswerGenerationClient } from 'src/modules/rag/domain/repositories/answer-generation-client.interface';
import { IDocumentChunkRepository } from 'src/modules/rag/domain/repositories/document-chunk.repo.interface';
import { IEmbeddingClient } from 'src/modules/rag/domain/repositories/embedding-client.interface';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { ChatAnswerService } from './chat-answer.service';

const embedding = Array.from({ length: 1536 }, () => 0.1);

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
  const chunks = { searchSimilarChunks: jest.fn() };
  const answerClient = { generateAnswer: jest.fn() };
  const config = { getOrThrow: jest.fn() };
  let model: string;
  let service: ChatAnswerService;
  let warning: jest.SpyInstance;

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
    expect(values.size).toBe(3);
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
      );
      expect(warning).toHaveBeenCalled();
    },
  );

  it('falls back to Gemini if reading the cache fails', async () => {
    cache.get.mockRejectedValueOnce(new Error('Redis unavailable'));
    expect((await service.generateAnswer(7, 12, 'Guide?')).isOk()).toBe(true);
    expect(cache.get).toHaveBeenCalledTimes(1);
    expect(embeddingClient.generateEmbeddings).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalled();
  });

  it('does not fail the answer if writing the cache fails', async () => {
    cache.set.mockRejectedValueOnce(new Error('Redis unavailable'));
    expect((await service.generateAnswer(7, 12, 'Guide?')).isOk()).toBe(true);
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(chunks.searchSimilarChunks).toHaveBeenCalledWith(
      7,
      12,
      embedding,
      5,
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
});
