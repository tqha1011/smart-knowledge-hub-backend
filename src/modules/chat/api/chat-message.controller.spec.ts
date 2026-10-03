import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Response } from 'express';
import { ok } from 'neverthrow';
import { JwtPayload } from 'src/shared/common/jwt.payload.interface';
import { JwtAuthGuard } from 'src/shared/common/jwt.guard';
import { RolesGuard } from 'src/shared/common/roles.guard';
import { CommonChatRole, SystemRole } from 'src/shared/domain/enum';
import { ChatMessageRequestDto } from '../application/dtos/chat-message.request.dto';
import { ChatCacheDiagnostics } from '../application/interfaces/chat-answer.service.interface';
import { IChatMessageService } from '../application/interfaces/chat-message.service.interface';
import { ChatMessageController } from './chat-message.controller';

describe('ChatMessageController load test cache headers', () => {
  const chatService = {
    chatAsync: jest.fn(
      (
        _user: string,
        _request: ChatMessageRequestDto,
        diagnostics?: ChatCacheDiagnostics,
      ) => {
        if (diagnostics) {
          diagnostics.embedding = 'hit';
          diagnostics.publicChunks = 'hit';
          diagnostics.restrictedChunks = 'miss';
        }
        return Promise.resolve(
          ok({
            messagePublicId: 'message',
            role: CommonChatRole.Assistant,
            content: 'answer',
            createdAt: new Date(),
            sources: [],
          }),
        );
      },
    ),
  };
  const config = { get: jest.fn() };
  const setHeader = jest.fn();
  const response = { setHeader } as unknown as Response;
  const user: JwtPayload = {
    sub: 'user' as JwtPayload['sub'],
    email: 'user@example.com',
    role: SystemRole.Employee,
  };
  const request = {
    knowledgeSpacePublicId: 'space',
    chatSessionPublicId: 'session',
    content: 'Where is the guide?',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['true', 3],
    ['false', 0],
  ])(
    'emits cache headers only when enabled=%s',
    async (enabled, headerCount) => {
      config.get.mockReturnValue(enabled);
      const module = await Test.createTestingModule({
        controllers: [ChatMessageController],
        providers: [
          { provide: IChatMessageService, useValue: chatService },
          { provide: ConfigService, useValue: config },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .compile();

      await module.get(ChatMessageController).chat(user, request, response);

      expect(setHeader).toHaveBeenCalledTimes(headerCount);
      if (enabled === 'true') {
        expect(setHeader).toHaveBeenCalledWith('X-Chat-Cache-Embedding', 'hit');
        expect(setHeader).toHaveBeenCalledWith('X-Chat-Cache-Public', 'hit');
        expect(setHeader).toHaveBeenCalledWith(
          'X-Chat-Cache-Restricted',
          'miss',
        );
      }
    },
  );
});
