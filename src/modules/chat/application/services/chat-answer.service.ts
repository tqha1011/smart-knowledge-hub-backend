import { Injectable } from '@nestjs/common';
import { Result, err, ok } from 'neverthrow';
import { IAnswerGenerationClient } from 'src/modules/rag/domain/repositories/answer-generation-client.interface';
import { IDocumentChunkRepository } from 'src/modules/rag/domain/repositories/document-chunk.repo.interface';
import { IEmbeddingClient } from 'src/modules/rag/domain/repositories/embedding-client.interface';
import {
  ChatAnswer,
  IChatAnswerService,
} from '../interfaces/chat-answer.service.interface';

const TOP_K = 5;
// Below this cosine similarity, retrieved chunks are treated as unrelated
// to the question rather than as usable context.
const MIN_SIMILARITY_SCORE = 0.5;

@Injectable()
export class ChatAnswerService implements IChatAnswerService {
  constructor(
    private readonly embeddingClient: IEmbeddingClient,
    private readonly documentChunkRepository: IDocumentChunkRepository,
    private readonly answerGenerationClient: IAnswerGenerationClient,
  ) {}

  async generateAnswer(
    knowledgeSpaceId: number,
    userId: number,
    question: string,
  ): Promise<Result<ChatAnswer, Error>> {
    const embeddingResult = await this.embeddingClient.generateEmbeddings(
      [question],
      'RETRIEVAL_QUERY',
    );
    if (embeddingResult.isErr()) {
      return err(embeddingResult.error);
    }
    const [queryEmbedding] = embeddingResult.value;

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
