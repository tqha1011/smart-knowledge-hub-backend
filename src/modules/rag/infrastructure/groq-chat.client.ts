import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { Result, err, ok } from 'neverthrow';
import { SystemPrompt } from 'src/shared/common/systemPrompt';
import {
  AnswerContextChunk,
  IAnswerGenerationClient,
} from '../domain/repositories/answer-generation-client.interface';

const GROQ_MODEL = 'llama-3.3-70b-versatile';

@Injectable()
export class GroqChatClient implements IAnswerGenerationClient {
  private readonly logger = new Logger(GroqChatClient.name);
  private readonly client: Groq;

  constructor(private readonly configService: ConfigService) {
    this.client = new Groq({
      apiKey: this.configService.getOrThrow('GROQ_API_KEY'),
    });
  }

  async generateAnswer(
    question: string,
    context: AnswerContextChunk[],
  ): Promise<Result<string, Error>> {
    try {
      const contextText = context
        .map(
          (chunk, index) =>
            `[${index + 1}] (${chunk.documentTitle})\n${chunk.content}`,
        )
        .join('\n\n');

      const completion = await this.client.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: SystemPrompt.GenerateChatPrompt(),
          },
          {
            role: 'user',
            content: `Context:\n${contextText}\n\nQuestion: ${question}`,
          },
        ],
      });

      const answer = completion.choices[0]?.message?.content;
      if (!answer) {
        return err(new Error('Groq returned no answer content'));
      }

      return ok(answer);
    } catch (error) {
      this.logger.error(`Error generating answer: ${error}`);
      return err(new Error('Failed to generate answer'));
    }
  }

  async generateSessionTitle(messages: string): Promise<Result<string, Error>> {
    try {
      const completion = await this.client.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: SystemPrompt.GenerateSessionTitlePrompt(),
          },
          {
            role: 'user',
            content: messages,
          },
        ],
      });

      const title = completion.choices[0]?.message?.content;
      if (!title) {
        return err(new Error('Groq returned no title content'));
      }

      return ok(title);
    } catch (error) {
      this.logger.error(`Error generating session title: ${error}`);
      return err(new Error('Failed to generate session title'));
    }
  }
}
