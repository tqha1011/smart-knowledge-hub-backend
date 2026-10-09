import { ConfigService } from '@nestjs/config';
import { ok } from 'neverthrow';
import { ChatMessageService } from './chat-message.service';
import { ErrorCode } from 'src/shared/common/errorCode';

describe('chat session ownership', () => {
  it('validates message content before reserving a demo question', async () => {
    const reserveQuestion = jest.fn().mockResolvedValue(true);
    const service = new ChatMessageService(
      {} as never,
      {
        getSessionIdDataByPublicId: jest
          .fn()
          .mockResolvedValue(ok({ id: 4, userId: 1 })),
      } as never,
      {
        getMembershipInKnowledgeSpace: jest
          .fn()
          .mockResolvedValue(
            ok({ userId: 1, knowledgeSpaceId: 7, role: 'Viewer' }),
          ),
      } as never,
      { generateAnswer: jest.fn() },
      {} as never,
      {} as never,
      {} as never,
      { reserveQuestion } as never,
      new ConfigService(),
    );
    const result = await service.chatAsync('guest', {
      knowledgeSpacePublicId: 'space',
      chatSessionPublicId: 'own',
      content: 'x'.repeat(4001),
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe(ErrorCode.BadRequest);
    expect(reserveQuestion).not.toHaveBeenCalled();
  });
  it('rejects another member session before writing messages or calling AI', async () => {
    const addMessage = jest
      .fn()
      .mockResolvedValue(ok({ id: 1, role: 'User', content: 'hi' }));
    const answer = jest.fn();
    const service = new ChatMessageService(
      { addMessage } as never,
      {
        getSessionIdDataByPublicId: jest
          .fn()
          .mockResolvedValue(ok({ id: 4, userId: 2, title: 'New chat' })),
      } as never,
      {
        getMembershipInKnowledgeSpace: jest
          .fn()
          .mockResolvedValue(
            ok({ userId: 1, knowledgeSpaceId: 7, role: 'Viewer' }),
          ),
      } as never,
      { generateAnswer: answer },
      {} as never,
      {} as never,
      { add: jest.fn() } as never,
      {} as never,
      new ConfigService(),
    );
    const result = await service.chatAsync('user-1', {
      knowledgeSpacePublicId: 'space',
      chatSessionPublicId: 'other-session',
      content: 'hi',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe(ErrorCode.NotFound);
    expect(addMessage).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });
});
