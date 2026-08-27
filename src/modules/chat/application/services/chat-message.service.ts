import { Injectable } from '@nestjs/common';
import { Result, err, ok } from 'neverthrow';
import { authorizeMembership } from 'src/modules/knowledge-space/application/services/authorizeMembership';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { CommonChatRole, KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { ChatMessage } from '../../domain/entities/chat-message.entity';
import { IAnswerSourceRepository } from '../../domain/repositories/answer-source.repo.interface';
import { IChatMessageRepository } from '../../domain/repositories/chat-message.repo.interface';
import { IChatSessionRepository } from '../../domain/repositories/chat-session.repo.interface';
import { IUnansweredQuestionRepository } from '../../domain/repositories/unanswered-question.repo.interface';
import { ChatMessageRequestDto } from '../dtos/chat-message.request.dto';
import { ChatMessageResponseDto } from '../dtos/chat-message.response.dto';
import { IChatAnswerService } from '../interfaces/chat-answer.service.interface';
import { IChatMessageService } from '../interfaces/chat-message.service.interface';

const NO_CONTEXT_ANSWER =
  "I couldn't find relevant information in this knowledge space to answer that question.";

@Injectable()
export class ChatMessageService implements IChatMessageService {
  constructor(
    private readonly chatMessageRepository: IChatMessageRepository,
    private readonly chatSessionRepository: IChatSessionRepository,
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
    private readonly chatAnswerService: IChatAnswerService,
    private readonly answerSourceRepository: IAnswerSourceRepository,
    private readonly unansweredQuestionRepository: IUnansweredQuestionRepository,
  ) {}

  async chatAsync(
    userPublicId: string,
    request: ChatMessageRequestDto,
  ): Promise<Result<ChatMessageResponseDto, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          request.knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Viewer,
        'chat in this knowledge space',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const checkIdResult =
        await this.chatSessionRepository.getSessionIdDataByPublicId(
          request.chatSessionPublicId,
          request.knowledgeSpacePublicId,
        );
      if (checkIdResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to check chat session ID.',
          ),
        );
      }
      if (checkIdResult.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Chat session not found.'));
      }
      const chatSessionId = checkIdResult.value.id;

      const newUserMessage = ChatMessage.createChatMessage({
        chatSessionId,
        role: CommonChatRole.User,
        content: request.content,
      });
      if (newUserMessage.isErr()) {
        return err(
          new AppError(ErrorCode.BadRequest, newUserMessage.error.message),
        );
      }
      const addUserMessageResult = await this.chatMessageRepository.addMessage(
        newUserMessage.value,
      );
      if (addUserMessageResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to add chat message.',
          ),
        );
      }

      const answerResult = await this.chatAnswerService.generateAnswer(
        membership.value.knowledgeSpaceId,
        membership.value.userId,
        request.content,
      );
      if (answerResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to generate an answer.',
          ),
        );
      }
      const answer = answerResult.value;

      if (!answer.answered) {
        await this.unansweredQuestionRepository.addUnansweredQuestion({
          question: request.content,
          reason: answer.reason,
          userId: membership.value.userId,
          knowledgeSpaceId: membership.value.knowledgeSpaceId,
        });
      }

      const assistantContent = answer.answered
        ? answer.content
        : NO_CONTEXT_ANSWER;

      const newAssistantMessage = ChatMessage.createChatMessage({
        chatSessionId,
        role: CommonChatRole.Assistant,
        content: assistantContent,
      });
      if (newAssistantMessage.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            newAssistantMessage.error.message,
          ),
        );
      }
      const addAssistantMessageResult =
        await this.chatMessageRepository.addMessage(newAssistantMessage.value);
      if (addAssistantMessageResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to add assistant message.',
          ),
        );
      }

      if (answer.answered && answer.sources.length > 0) {
        await this.answerSourceRepository.addAnswerSources(
          answer.sources.map((source) => ({
            messageId: addAssistantMessageResult.value.id,
            documentId: source.documentId,
            knowledgeSpaceId: membership.value.knowledgeSpaceId,
            chunkId: source.chunkId,
            score: source.score,
          })),
        );
      }

      return ok({
        messagePublicId: newAssistantMessage.value.messagePublicId,
        role: newAssistantMessage.value.role,
        content: assistantContent,
        createdAt: newAssistantMessage.value.createdAt,
        sources: answer.answered
          ? answer.sources.map((source) => ({
              documentPublicId: source.documentPublicId,
              documentTitle: source.documentTitle,
              excerpt: source.content,
              score: source.score,
            }))
          : [],
      });
    } catch (error) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to process chat message. ${error}`,
        ),
      );
    }
  }
}
