import { Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  ChatSessionListData,
  CreatedChatSessionData,
} from '../application/dtos/chat-session.response.dto';
import {
  ChatSessionDetailRecord,
  ChatSessionIdData,
  IChatSessionRepository,
} from '../domain/repositories/chat-session.repo.interface';

@Injectable()
export class ChatSessionRepository implements IChatSessionRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async getSessionIdDataByPublicId(
    sessionPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<ChatSessionIdData | null, Error>> {
    try {
      const sessionIdData: ChatSessionIdData | null =
        await this.prismaService.chatSession.findUnique({
          where: {
            publicId: sessionPublicId,
            isDeleted: false,
            knowledgeSpace: {
              publicId: knowledgeSpacePublicId,
            },
          },
          select: {
            id: true,
            knowledgeSpaceId: true,
          },
        });
      return ok(sessionIdData);
    } catch (error) {
      return err(
        new Error(`Failed to get session ID data by public ID: ${error}`),
      );
    }
  }
  async createSession(
    userId: number,
    knowledgeSpaceId: number,
    title: string,
  ): Promise<Result<CreatedChatSessionData, Error>> {
    try {
      const session = await this.prismaService.chatSession.create({
        data: { userId, knowledgeSpaceId, title },
        select: { publicId: true, title: true },
      });
      return ok(session);
    } catch (error) {
      return err(new Error(`Failed to create chat session: ${error}`));
    }
  }
  async softDeleteSession(
    sessionPublicId: string,
    userId: number,
    knowledgeSpaceId: number,
  ): Promise<Result<boolean, Error>> {
    try {
      const result = await this.prismaService.chatSession.updateMany({
        where: {
          publicId: sessionPublicId,
          userId,
          knowledgeSpaceId,
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
      return ok(result.count > 0);
    } catch (error) {
      return err(new Error(`Failed to delete chat session: ${error}`));
    }
  }
  async getSessionsForUser(
    userId: number,
    knowledgeSpaceId: number,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<ChatSessionListData>, Error>> {
    try {
      const [sessions, totalSessions] = await this.prismaService.$transaction([
        this.prismaService.chatSession.findMany({
          where: { userId, knowledgeSpaceId, isDeleted: false },
          select: { publicId: true, title: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          skip: (pagination.pageNumber - 1) * pagination.pageSize,
          take: pagination.pageSize,
        }),
        this.prismaService.chatSession.count({
          where: { userId, knowledgeSpaceId, isDeleted: false },
        }),
      ]);
      return ok(
        new PageResult<ChatSessionListData>(
          sessions,
          totalSessions,
          pagination.pageNumber,
          pagination.pageNumber,
          pagination.pageSize,
        ),
      );
    } catch (error) {
      return err(new Error(`Failed to get chat sessions for user: ${error}`));
    }
  }
  async getSessionDetail(
    sessionPublicId: string,
    userId: number,
    knowledgeSpaceId: number,
  ): Promise<Result<ChatSessionDetailRecord | null, Error>> {
    try {
      const session = await this.prismaService.chatSession.findFirst({
        where: {
          publicId: sessionPublicId,
          userId,
          knowledgeSpaceId,
          isDeleted: false,
        },
        select: { id: true, publicId: true, title: true, createdAt: true },
      });
      return ok(session);
    } catch (error) {
      return err(new Error(`Failed to get chat session detail: ${error}`));
    }
  }
  async updateSessionTitle(
    chatSessionId: number,
    title: string,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.chatSession.update({
        where: { id: chatSessionId },
        data: { title },
      });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to update chat session title: ${error}`));
    }
  }
}
