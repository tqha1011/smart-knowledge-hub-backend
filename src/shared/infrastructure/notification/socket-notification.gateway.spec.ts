import { JwtService } from '@nestjs/jwt';
import { err, ok } from 'neverthrow';
import { Socket } from 'socket.io';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { SocketNotificationGateway } from './socket-notification.gateway';

function createSocket(token?: string) {
  const join = jest.fn().mockResolvedValue(undefined);
  const disconnect = jest.fn();
  const socket = {
    id: 'socket-1',
    handshake: { auth: { token } },
    join,
    disconnect,
  } as unknown as Socket;
  return { socket, join, disconnect };
}

describe('SocketNotificationGateway', () => {
  let jwtService: { verifyAsync: jest.Mock };
  let userRepository: { GetUserIdByPublicId: jest.Mock };
  let knowledgeSpaceRepository: { getKnowledgeSpaceIdsForUser: jest.Mock };
  let gateway: SocketNotificationGateway;

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    userRepository = { GetUserIdByPublicId: jest.fn() };
    knowledgeSpaceRepository = { getKnowledgeSpaceIdsForUser: jest.fn() };
    gateway = new SocketNotificationGateway(
      jwtService as unknown as JwtService,
      userRepository as unknown as IUserRepository,
      knowledgeSpaceRepository as unknown as IKnowledgeSpaceRepository,
    );
  });

  describe('handleConnection', () => {
    it('joins a room for every knowledge space the authenticated user belongs to', async () => {
      const { socket, join, disconnect } = createSocket('valid-token');
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-public-id',
        email: 'a@b.com',
        role: 'employee',
      });
      userRepository.GetUserIdByPublicId.mockResolvedValue(ok(9));
      knowledgeSpaceRepository.getKnowledgeSpaceIdsForUser.mockResolvedValue(
        ok([7, 12]),
      );

      await gateway.handleConnection(socket);

      expect(join).toHaveBeenCalledWith('ks:7');
      expect(join).toHaveBeenCalledWith('ks:12');
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('disconnects a socket with no auth token', async () => {
      const { socket, disconnect } = createSocket(undefined);

      await gateway.handleConnection(socket);

      expect(disconnect).toHaveBeenCalled();
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('disconnects a socket with an invalid token', async () => {
      const { socket, join, disconnect } = createSocket('bad-token');
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await gateway.handleConnection(socket);

      expect(disconnect).toHaveBeenCalled();
      expect(join).not.toHaveBeenCalled();
    });

    it('disconnects safely when the knowledge space lookup fails', async () => {
      const { socket, join, disconnect } = createSocket('valid-token');
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-public-id',
        email: 'a@b.com',
        role: 'employee',
      });
      userRepository.GetUserIdByPublicId.mockResolvedValue(ok(9));
      knowledgeSpaceRepository.getKnowledgeSpaceIdsForUser.mockResolvedValue(
        err(new Error('db down')),
      );

      await gateway.handleConnection(socket);

      expect(disconnect).toHaveBeenCalled();
      expect(join).not.toHaveBeenCalled();
    });
  });

  describe('notifyDocumentStatus', () => {
    it('emits the payload to the room for the given knowledge space', () => {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      (gateway as unknown as { server: { to: jest.Mock } }).server = { to };

      const payload = {
        documentPublicId: 'doc-1',
        knowledgeSpacePublicId: 'ks-1',
        fileName: 'Handbook.pdf',
        status: 'Ready' as const,
        updatedAt: '2026-09-09T00:00:00.000Z',
      };

      gateway.notifyDocumentStatus(7, payload);

      expect(to).toHaveBeenCalledWith('ks:7');
      expect(emit).toHaveBeenCalledWith('document.status.updated', payload);
    });

    it('swallows an emit failure instead of throwing', () => {
      const to = jest.fn().mockImplementation(() => {
        throw new Error('redis adapter unavailable');
      });
      (gateway as unknown as { server: { to: jest.Mock } }).server = { to };

      expect(() =>
        gateway.notifyDocumentStatus(7, {
          documentPublicId: 'doc-1',
          knowledgeSpacePublicId: 'ks-1',
          fileName: 'Handbook.pdf',
          status: 'Failed',
          updatedAt: '2026-09-09T00:00:00.000Z',
        }),
      ).not.toThrow();
    });
  });
});
