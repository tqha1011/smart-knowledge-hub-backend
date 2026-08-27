import { Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  AnswerSourceInput,
  IAnswerSourceRepository,
} from '../domain/repositories/answer-source.repo.interface';

@Injectable()
export class AnswerSourceRepository implements IAnswerSourceRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async addAnswerSources(
    sources: AnswerSourceInput[],
  ): Promise<Result<undefined, Error>> {
    if (sources.length === 0) {
      return ok(undefined);
    }
    try {
      await this.prismaService.answerSource.createMany({
        data: sources.map((source) => ({
          messageId: source.messageId,
          documentId: source.documentId,
          knowledgeSpaceId: source.knowledgeSpaceId,
          chunkId: source.chunkId,
          score: source.score,
        })),
      });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to add answer sources: ${error}`));
    }
  }
}
