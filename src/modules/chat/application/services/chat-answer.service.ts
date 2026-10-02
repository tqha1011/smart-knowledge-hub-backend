import { Injectable, Logger } from '@nestjs/common';
import { Result, err, ok } from 'neverthrow';
import { IAnswerGenerationClient } from 'src/modules/rag/domain/repositories/answer-generation-client.interface';
import { IDocumentChunkRepository } from 'src/modules/rag/domain/repositories/document-chunk.repo.interface';
import { IEmbeddingClient } from 'src/modules/rag/domain/repositories/embedding-client.interface';
import {
  ChatAnswer,
  IChatAnswerService,
} from '../interfaces/chat-answer.service.interface';
import { ConfigService } from '@nestjs/config';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { createHash } from 'crypto';

export type SimilarChunksCacheKeyInput = {
  knowledgeSpaceId: number;
  userId: number;
  questionEmbedding: number[];
  model: string;
  taskType: string;
  topK: number;
  corpusVersion: string;
};

export function buildSimilarChunksCacheKey({
  knowledgeSpaceId,
  userId,
  questionEmbedding,
  model,
  taskType,
  topK,
  corpusVersion,
}: SimilarChunksCacheKeyInput): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([questionEmbedding, model, taskType, topK]))
    .digest('hex');
  return `rag:similar-chunks:v1:${knowledgeSpaceId}:${userId}:${corpusVersion}:${digest}`;
}

const QUERY_EMBEDDING_TASK = 'RETRIEVAL_QUERY';
const QUERY_EMBEDDING_DIMENSIONS = 1536;

export function buildQuestionEmbeddingCacheKey(
  question: string,
  model: string,
): string {
  const digest = createHash('sha256').update(question).digest('hex');
  return `rag:question-embedding:v1:${model}:${QUERY_EMBEDDING_TASK}:${QUERY_EMBEDDING_DIMENSIONS}:${digest}`;
}

function isValidQueryEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === QUERY_EMBEDDING_DIMENSIONS &&
    value.every(
      (entry: unknown) => typeof entry === 'number' && Number.isFinite(entry),
    )
  );
}

const TOP_K = 5;
// Below this cosine similarity, retrieved chunks are treated as unrelated
// to the question rather than as usable context.
const MIN_SIMILARITY_SCORE = 0.5;

@Injectable()
export class ChatAnswerService implements IChatAnswerService {
  private readonly logger = new Logger(ChatAnswerService.name);
  constructor(
    private readonly embeddingClient: IEmbeddingClient,
    private readonly documentChunkRepository: IDocumentChunkRepository,
    private readonly answerGenerationClient: IAnswerGenerationClient,
    private readonly configService: ConfigService,
    private readonly cache: IApplicationCache,
  ) {}

  async generateAnswer(
    knowledgeSpaceId: number,
    userId: number,
    question: string,
  ): Promise<Result<ChatAnswer, Error>> {
    const cacheKey = buildQuestionEmbeddingCacheKey(
      question,
      this.configService.getOrThrow<string>('GEMINI_EMBEDDING_MODEL'),
    );
    let queryEmbedding: number[] | undefined;
    try {
      const cached = await this.cache.get<string>(cacheKey);
      if (cached !== undefined && cached !== null) {
        if (typeof cached !== 'string') {
          throw new Error('Invalid cached query embedding');
        }
        const parsed: unknown = JSON.parse(cached);
        if (!isValidQueryEmbedding(parsed)) {
          throw new Error('Invalid cached query embedding');
        }
        queryEmbedding = parsed;
      }
    } catch (error) {
      this.logger.warn('Failed to read query embedding cache', error);
    }

    if (queryEmbedding === undefined) {
      const embeddingResult = await this.embeddingClient.generateEmbeddings(
        [question],
        QUERY_EMBEDDING_TASK,
      );
      if (embeddingResult.isErr()) {
        return err(embeddingResult.error);
      }
      [queryEmbedding] = embeddingResult.value;
      if (isValidQueryEmbedding(queryEmbedding)) {
        try {
          await this.cache.set(cacheKey, JSON.stringify(queryEmbedding));
        } catch (error) {
          this.logger.warn('Failed to write query embedding cache', error);
        }
      }
    }

    const searchResult = await this.documentChunkRepository.searchSimilarChunks(
      knowledgeSpaceId,
      userId,
      queryEmbedding,
      TOP_K,
    );
    if (searchResult.isErr()) {
      return err(searchResult.error);
    }

    const relevantChunks = searchResult.value.filter(
      (chunk) => chunk.score >= MIN_SIMILARITY_SCORE,
    );
    if (relevantChunks.length === 0) {
      return ok({
        answered: false,
        reason: 'No relevant document content was found for this question.',
      });
    }

    const answerResult = await this.answerGenerationClient.generateAnswer(
      question,
      relevantChunks.map((chunk) => ({
        documentTitle: chunk.documentTitle,
        content: chunk.content,
      })),
    );
    if (answerResult.isErr()) {
      return err(answerResult.error);
    }

    return ok({
      answered: true,
      content: answerResult.value,
      sources: relevantChunks.map((chunk) => ({
        documentPublicId: chunk.documentPublicId,
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        chunkId: chunk.chunkId,
        content: chunk.content,
        score: chunk.score,
      })),
    });
  }
}
