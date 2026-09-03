import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { err, ok, Result } from 'neverthrow';
import { ICategoryRepository } from 'src/modules/category/domain/repositories/category.repo.interface';
import { authorizeMembership } from 'src/modules/knowledge-space/application/services/authorizeMembership';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { Document } from 'src/modules/document/domain/entities/document.entity';
import { IDocumentRepository } from 'src/modules/document/domain/repositories/document.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import {
  CommonDocumentStatus,
  CommonDocumentType,
  CommonDocumentVisibility,
  KnowledgeSpaceRole,
} from 'src/shared/domain/enum';
import { EventName } from 'src/shared/infrastructure/queue/constant/event-name';
import { QueueName } from 'src/shared/infrastructure/queue/constant/queue-name';
import { IUnansweredQuestionQueryRepository } from '../interfaces/unanswered-question.query.repo.interface';
import { IUnansweredQuestionService } from '../interfaces/unanswered-question.service.interface';
import { UnansweredQuestionListData } from '../dtos/unanswered-question.response.dto';
import { IUnansweredQuestionRepository } from '../../domain/repositories/unanswered-question.repo.interface';

const FAQ_CATEGORY_NAME = 'Resolved Questions';
const FAQ_DOCUMENT_TITLE = 'Resolved Questions';

@Injectable()
export class UnansweredQuestionService implements IUnansweredQuestionService {
  private readonly logger = new Logger(UnansweredQuestionService.name);
  constructor(
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
    private readonly unansweredQuestionRepository: IUnansweredQuestionRepository,
    private readonly unansweredQuestionQueryRepository: IUnansweredQuestionQueryRepository,
    private readonly documentRepository: IDocumentRepository,
    private readonly categoryRepository: ICategoryRepository,
    @InjectQueue(QueueName.IngestionQueue) private ingestionQueue: Queue,
  ) {}

  async getUnansweredQuestionsAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<UnansweredQuestionListData>, AppError>> {
    const membership = authorizeMembership(
      await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
        userPublicId,
        knowledgeSpacePublicId,
      ),
      KnowledgeSpaceRole.Viewer,
      'view unanswered questions',
    );
    if (membership.isErr()) {
      return err(membership.error);
    }

    const listResult =
      await this.unansweredQuestionQueryRepository.getUnansweredQuestions(
        membership.value.knowledgeSpaceId,
        pagination,
      );
    if (listResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to get unanswered questions.',
        ),
      );
    }

    return ok(listResult.value);
  }

  async resolveUnansweredQuestionAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    questionPublicId: string,
    answer: string,
  ): Promise<Result<undefined, AppError>> {
    const membership = authorizeMembership(
      await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
        userPublicId,
        knowledgeSpacePublicId,
      ),
      KnowledgeSpaceRole.Editor,
      'resolve unanswered questions',
    );
    if (membership.isErr()) {
      return err(membership.error);
    }

    const questionResult =
      await this.unansweredQuestionRepository.getUnresolvedQuestion(
        membership.value.knowledgeSpaceId,
        questionPublicId,
      );
    if (questionResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to resolve the question. ${questionResult.error.message}`,
        ),
      );
    }
    if (questionResult.value === null) {
      return err(
        new AppError(
          ErrorCode.NotFound,
          'Unanswered question not found or already resolved.',
        ),
      );
    }

    // Write the answer into the FAQ document before marking resolved, so a
    // failure here leaves the question resolvable again rather than losing
    // the answer.
    const faqResult = await this.appendToFaqDocument(
      membership.value.knowledgeSpaceId,
      knowledgeSpacePublicId,
      membership.value.userId,
      questionResult.value.question,
      answer,
    );
    if (faqResult.isErr()) {
      return err(faqResult.error);
    }

    const markResult =
      await this.unansweredQuestionRepository.markResolveQuestion(
        membership.value.knowledgeSpaceId,
        questionPublicId,
      );
    if (markResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to mark the question resolved. ${markResult.error.message}`,
        ),
      );
    }
    if (!markResult.value) {
      return err(
        new AppError(
          ErrorCode.NotFound,
          'Unanswered question not found or already resolved.',
        ),
      );
    }

    return ok(undefined);
  }

  /**
   * Creates the knowledge space's FAQ document on first use, or appends to it
   * otherwise, then re-enqueues it for ingestion. The document backs its
   * content from the `content` column, so `storagePath`/`fileType`/`fileSize`
   * are placeholders — no object is ever written to file storage for it.
   */
  private async appendToFaqDocument(
    knowledgeSpaceId: number,
    knowledgeSpacePublicId: string,
    resolverId: number,
    question: string,
    answer: string,
  ): Promise<Result<undefined, AppError>> {
    const categoryIdResult = await this.resolveFaqCategoryId(knowledgeSpaceId);
    if (categoryIdResult.isErr()) {
      return err(categoryIdResult.error);
    }

    const qnaBlock = `### Q: ${question}\n\n${answer}\n`;

    const faqDocumentIdResult =
      await this.knowledgeSpaceRepository.getFaqDocumentId(knowledgeSpaceId);
    if (faqDocumentIdResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to resolve FAQ document. ${faqDocumentIdResult.error.message}`,
        ),
      );
    }

    let documentPublicId: string;
    if (faqDocumentIdResult.value === null) {
      const newDocumentResult = Document.createDocument({
        title: FAQ_DOCUMENT_TITLE,
        description: null,
        content: qnaBlock,
        authorId: resolverId,
        knowledgeSpaceId,
        categoryId: categoryIdResult.value,
        visibility: CommonDocumentVisibility.Public,
        storagePath: `faq/${knowledgeSpacePublicId}.md`,
        fileSize: Buffer.byteLength(qnaBlock, 'utf-8'),
        fileType: CommonDocumentType.MD,
      });
      if (newDocumentResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to build FAQ document. ${newDocumentResult.error.message}`,
          ),
        );
      }
      const newDocument = newDocumentResult.value;

      const addResult = await this.documentRepository.addDocument(newDocument);
      if (addResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to create FAQ document. ${addResult.error.message}`,
          ),
        );
      }

      const newDocumentIdResult =
        await this.documentRepository.getDocumentIdByPublicId(
          newDocument.publicId,
        );
      if (newDocumentIdResult.isErr() || newDocumentIdResult.value === null) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to resolve the newly created FAQ document',
          ),
        );
      }

      const setFaqResult = await this.knowledgeSpaceRepository.setFaqDocumentId(
        knowledgeSpaceId,
        newDocumentIdResult.value,
      );
      if (setFaqResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to link the FAQ document. ${setFaqResult.error.message}`,
          ),
        );
      }

      documentPublicId = newDocument.publicId;
    } else {
      const existingResult =
        await this.documentRepository.getDocumentContentById(
          faqDocumentIdResult.value,
        );
      if (existingResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to read the FAQ document. ${existingResult.error.message}`,
          ),
        );
      }
      if (existingResult.value === null) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'The knowledge space FAQ document no longer exists',
          ),
        );
      }

      const newContent = existingResult.value.content
        ? `${existingResult.value.content}\n${qnaBlock}`
        : qnaBlock;

      const updateResult = await this.documentRepository.updateDocument(
        faqDocumentIdResult.value,
        { content: newContent, status: CommonDocumentStatus.Processing },
      );
      if (updateResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to update the FAQ document. ${updateResult.error.message}`,
          ),
        );
      }

      documentPublicId = existingResult.value.publicId;
    }

    try {
      await this.ingestionQueue.add(
        EventName.IngestionDocument,
        { documentPublicId },
        {
          attempts: 3, // retry up to 3 times in case of failure
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue FAQ document ingestion for document ${documentPublicId}`,
        error,
      );
    }

    return ok(undefined);
  }

  private async resolveFaqCategoryId(
    knowledgeSpaceId: number,
  ): Promise<Result<number, AppError>> {
    const existingResult = await this.categoryRepository.getCategoryIdByName(
      FAQ_CATEGORY_NAME,
      knowledgeSpaceId,
    );
    if (existingResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to resolve FAQ category. ${existingResult.error.message}`,
        ),
      );
    }
    if (existingResult.value !== null) {
      return ok(existingResult.value);
    }

    const createdResult = await this.categoryRepository.createCategory(
      randomUUID(),
      FAQ_CATEGORY_NAME,
      knowledgeSpaceId,
    );
    if (createdResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to create FAQ category. ${createdResult.error.message}`,
        ),
      );
    }
    return ok(createdResult.value.id);
  }
}
