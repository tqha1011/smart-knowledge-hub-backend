import { JwtService } from '@nestjs/jwt';
import { err, ok } from 'neverthrow';
import { Server, Socket } from 'socket.io';
import { DocumentStatusAudienceRepository } from './document-status-audience.repo';
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
  let audienceRepository: { getRecipientUserIds: jest.Mock };
  let gateway: SocketNotificationGateway;

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    userRepository = { GetUserIdByPublicId: jest.fn() };
    audienceRepository = {
      getRecipientUserIds: jest.fn().mockResolvedValue([9, 12]),
    };
    gateway = new SocketNotificationGateway(
      jwtService as unknown as JwtService,
      userRepository as unknown as IUserRepository,
      audienceRepository as unknown as DocumentStatusAudienceRepository,
    );
  });

  describe('handleConnection', () => {
    it('joins only the authenticated internal user room', async () => {
      const { socket, join, disconnect } = createSocket('valid-token');
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-public-id',
        email: 'a@b.com',
        role: 'employee',
      });
      userRepository.GetUserIdByPublicId.mockResolvedValue(ok(9));

      await gateway.handleConnection(socket);

      expect(join).toHaveBeenCalledTimes(1);
      expect(join).toHaveBeenCalledWith('user:9');
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

    it('disconnects safely when the user lookup fails', async () => {
      const { socket, join, disconnect } = createSocket('valid-token');
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-public-id',
        email: 'a@b.com',
        role: 'employee',
      });
      userRepository.GetUserIdByPublicId.mockResolvedValue(
        err(new Error('db down')),
      );

      await gateway.handleConnection(socket);

      expect(disconnect).toHaveBeenCalled();
      expect(join).not.toHaveBeenCalled();
    });
  });

  describe('notifyDocumentStatus', () => {
    it('emits once to the union of authorized user rooms', async () => {
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

      await gateway.notifyDocumentStatus(7, payload);

      expect(audienceRepository.getRecipientUserIds).toHaveBeenCalledWith(
        7,
        payload,
      );
      expect(to).toHaveBeenCalledTimes(1);
      expect(to).toHaveBeenCalledWith(['user:9', 'user:12']);
      expect(emit).toHaveBeenCalledWith('document.status.updated', payload);
    });

    it.each(['no recipients', 'query failure'])(
      'does not emit with %s',
      async (failure) => {
        const to = jest.fn();
        (gateway as unknown as { server: { to: jest.Mock } }).server = { to };
        if (failure === 'query failure')
          audienceRepository.getRecipientUserIds.mockRejectedValueOnce(
            new Error('DB unavailable'),
          );
        else audienceRepository.getRecipientUserIds.mockResolvedValueOnce([]);
        await expect(
          gateway.notifyDocumentStatus(7, {
            documentPublicId: 'doc-1',
            knowledgeSpacePublicId: 'ks-1',
            fileName: 'Handbook.pdf',
            status: 'Failed',
            updatedAt: '2026-09-09T00:00:00.000Z',
          }),
        ).resolves.toBeUndefined();
        expect(to).not.toHaveBeenCalled();
      },
    );

    it('rechecks audience on every event while sockets remain connected', async () => {
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
      audienceRepository.getRecipientUserIds
        .mockResolvedValueOnce([9, 12])
        .mockResolvedValueOnce([12]);
      await gateway.notifyDocumentStatus(7, payload);
      await gateway.notifyDocumentStatus(7, payload);
      expect(to.mock.calls).toEqual([[['user:9', 'user:12']], [['user:12']]]);
    });

    it('delivers exactly once per connected tab using the real Socket.IO room adapter', async () => {
      const io = new Server();
      const namespace = io.of('/realtime');
      const writes = new Map<string, jest.Mock>();
      for (const [id, rooms] of [
        ['tab-a', ['user:9', 'user:12']],
        ['tab-b', ['user:9']],
        ['tab-c', ['user:12']],
        ['denied-tab', ['user:13']],
      ] as [string, string[]][]) {
        const writeToEngine = jest.fn();
        writes.set(id, writeToEngine);
        namespace.sockets.set(id, {
          id,
          client: { writeToEngine },
        } as unknown as Socket);
        await namespace.adapter.addAll(id, new Set(rooms));
      }
      (gateway as unknown as { server: typeof namespace }).server = namespace;
      const payload = {
        documentPublicId: 'doc-1',
        knowledgeSpacePublicId: 'ks-1',
        fileName: 'Handbook.pdf',
        status: 'Ready' as const,
        updatedAt: '2026-09-09T00:00:00.000Z',
      };
      await gateway.notifyDocumentStatus(7, payload);
      for (const id of ['tab-a', 'tab-b', 'tab-c']) {
        expect(writes.get(id)).toHaveBeenCalledTimes(1);
        expect(
          (writes.get(id)?.mock.calls[0] as [string[], unknown])[0],
        ).toEqual([
          `2/realtime,${JSON.stringify(['document.status.updated', payload])}`,
        ]);
      }
      expect(writes.get('denied-tab')).not.toHaveBeenCalled();
      namespace.sockets.clear();
      await namespace.adapter.close();
    });

    it('swallows an emit failure instead of throwing', async () => {
      const to = jest.fn().mockImplementation(() => {
        throw new Error('redis adapter unavailable');
      });
      (gateway as unknown as { server: { to: jest.Mock } }).server = { to };

      await expect(
        gateway.notifyDocumentStatus(7, {
          documentPublicId: 'doc-1',
          knowledgeSpacePublicId: 'ks-1',
          fileName: 'Handbook.pdf',
          status: 'Failed',
          updatedAt: '2026-09-09T00:00:00.000Z',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
