import { Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { UnansweredQuestionListData } from '../application/dtos/unanswered-question.response.dto';
import { IUnansweredQuestionQueryRepository } from '../application/interfaces/unanswered-question.query.repo.interface';
import {
  IUnansweredQuestionRepository,
  UnansweredQuestionInput,
} from '../domain/repositories/unanswered-question.repo.interface';

@Injectable()
export class UnansweredQuestionRepository
  implements IUnansweredQuestionRepository, IUnansweredQuestionQueryRepository
{
  constructor(private readonly prismaService: PrismaService) {}
  async markResolveQuestion(
    knowledgeSpaceId: number,
    questionPublicId: string,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.unAnsweredQuestion.update({
        where: {
          knowledgeSpaceId: knowledgeSpaceId,
          publicId: questionPublicId,
        },
        data: {
          resolvedAt: new Date(),
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to mark resolve question: ${error}`));
    }
  }
  async getUnansweredQuestions(
    knowledgeSpaceId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<UnansweredQuestionListData>, Error>> {
    try {
      const [unansweredQuestions, totalItems] = await Promise.all([
        this.prismaService.unAnsweredQuestion.findMany({
          where: { knowledgeSpaceId, resolvedAt: null },
          select: {
            publicId: true,
            question: true,
            reason: true,
            createdAt: true,
          },
          skip: (pagination.pageNumber - 1) * pagination.pageSize,
          take: pagination.pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        this.prismaService.unAnsweredQuestion.count({
          where: { knowledgeSpaceId, resolvedAt: null },
        }),
      ]);
      const unansweredQuestionList: UnansweredQuestionListData[] =
        unansweredQuestions.map((uq) => ({
          publicId: uq.publicId,
          question: uq.question,
          reason: uq.reason,
        }));
      return ok(
        new PageResult<UnansweredQuestionListData>(
          unansweredQuestionList,
          totalItems,
          pagination.pageNumber,
          pagination.pageNumber,
          pagination.pageSize,
        ),
      );
    } catch (error) {
      return err(new Error(`Failed to get unanswered questions: ${error}`));
    }
  }

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
