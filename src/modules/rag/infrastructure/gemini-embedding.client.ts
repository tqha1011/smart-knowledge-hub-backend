import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Result, err, ok } from 'neverthrow';
import {
  EmbeddingTaskType,
  IEmbeddingClient,
} from '../domain/repositories/embedding-client.interface';

const EMBEDDING_BATCH_SIZE = 100; // Adjust this based on the API's limitations

@Injectable()
export class GeminiEmbeddingClient implements IEmbeddingClient {
  private readonly logger = new Logger(GeminiEmbeddingClient.name);
  private readonly client: GoogleGenAI;
  constructor(private readonly configService: ConfigService) {
    this.client = new GoogleGenAI({
      apiKey: this.configService.getOrThrow('GEMINI_API_KEY'),
    });
  }
  async generateEmbeddings(
    texts: string[],
    taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT',
  ): Promise<Result<number[][], Error>> {
    // Implementation for generating embeddings with Gemini
    try {
      const vectorEmbeddings: number[][] = [];
      for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
        // Call the Gemini API to generate embeddings for the batch
        // For demonstration, we'll simulate the API call with a placeholder
        const response = await this.client.models.embedContent({
          model: 'gemini-embedding-001',
          contents: batch,
          config: {
            outputDimensionality: 1536,
            taskType,
          },
        });

        if (
          !response.embeddings ||
          response.embeddings.length !== batch.length
        ) {
          return err(new Error('Gemini returned no embeddings for a batch'));
        }
        for (const embedding of response.embeddings) {
          if (!embedding.values) {
            return err(
              new Error('Gemini returned an embedding with no values'),
            );
          }

          vectorEmbeddings.push(embedding.values);
        }
      }
      return ok(vectorEmbeddings);
    } catch (error) {
      this.logger.error(`Error generating embeddings: ${error}`);
      return err(new Error('Failed to generate embeddings'));
    }
  }
}
