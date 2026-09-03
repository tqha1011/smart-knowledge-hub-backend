import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { authorizeMembership } from 'src/modules/knowledge-space/application/services/authorizeMembership';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { IChatMessageRepository } from '../../domain/repositories/chat-message.repo.interface';
import { IChatSessionRepository } from '../../domain/repositories/chat-session.repo.interface';
import {
  ChatSessionListData,
  CreatedChatSessionData,
} from '../dtos/chat-session.response.dto';
import {
  ChatSessionDetailWithMessages,
  IChatSessionService,
} from '../interfaces/chat-session.service.interface';

export const DEFAULT_SESSION_TITLE = 'New chat';

@Injectable()
export class ChatSessionService implements IChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);
  constructor(
    private readonly chatSessionRepository: IChatSessionRepository,
    private readonly chatMessageRepository: IChatMessageRepository,
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
  ) {}

  async createSessionAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<CreatedChatSessionData, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Viewer,
        'create a chat session',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const createResult = await this.chatSessionRepository.createSession(
        membership.value.userId,
        membership.value.knowledgeSpaceId,
        DEFAULT_SESSION_TITLE,
      );
      if (createResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to create chat session. ${createResult.error.message}`,
          ),
        );
      }
      return ok(createResult.value);
    } catch (error) {
      this.logger.error('Failed to create chat session', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to create chat session',
        ),
      );
    }
  }

  async deleteSessionAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    sessionPublicId: string,
  ): Promise<Result<undefined, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Viewer,
        'delete a chat session',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const deleteResult = await this.chatSessionRepository.softDeleteSession(
        sessionPublicId,
        membership.value.userId,
        membership.value.knowledgeSpaceId,
      );
      if (deleteResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to delete chat session. ${deleteResult.error.message}`,
          ),
        );
      }
      if (!deleteResult.value) {
        return err(new AppError(ErrorCode.NotFound, 'Chat session not found.'));
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to delete chat session', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to delete chat session',
        ),
      );
    }
  }

  async getSessionsForUserAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<ChatSessionListData>, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Viewer,
        'list chat sessions',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const listResult = await this.chatSessionRepository.getSessionsForUser(
        membership.value.userId,
        membership.value.knowledgeSpaceId,
        pagination,
      );
      if (listResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get chat sessions. ${listResult.error.message}`,
          ),
        );
      }
      return ok(listResult.value);
    } catch (error) {
      this.logger.error('Failed to get chat sessions', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to get chat sessions',
        ),
      );
    }
  }

  async getSessionDetailAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    sessionPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<ChatSessionDetailWithMessages, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Viewer,
        'view a chat session',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const sessionResult = await this.chatSessionRepository.getSessionDetail(
        sessionPublicId,
        membership.value.userId,
        membership.value.knowledgeSpaceId,
      );
      if (sessionResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get chat session. ${sessionResult.error.message}`,
          ),
        );
      }
      if (sessionResult.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Chat session not found.'));
      }

      const messagesResult =
        await this.chatMessageRepository.getMessagesBySessionId(
          sessionResult.value.id,
          pagination,
        );
      if (messagesResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get chat messages. ${messagesResult.error.message}`,
          ),
        );
      }

      return ok({
        publicId: sessionResult.value.publicId,
        title: sessionResult.value.title,
        createdAt: sessionResult.value.createdAt,
        messages: messagesResult.value,
      });
    } catch (error) {
      this.logger.error('Failed to get chat session detail', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to get chat session detail',
        ),
      );
    }
  }
}
