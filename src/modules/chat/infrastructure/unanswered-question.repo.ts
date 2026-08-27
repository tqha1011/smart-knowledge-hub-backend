import { Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  IUnansweredQuestionRepository,
  UnansweredQuestionInput,
} from '../domain/repositories/unanswered-question.repo.interface';

@Injectable()
export class UnansweredQuestionRepository implements IUnansweredQuestionRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async addUnansweredQuestion(
    input: UnansweredQuestionInput,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.unAnsweredQuestion.create({
        data: {
          question: input.question,
          reason: input.reason,
          userId: input.userId,
          knowledgeSpaceId: input.knowledgeSpaceId,
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to add unanswered question: ${error}`));
    }
  }
}
