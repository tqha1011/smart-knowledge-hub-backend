import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { ALLOWED_ORIGINS } from 'src/shared/common/cors';
import { JwtPayload } from 'src/shared/common/jwt.payload.interface';
import {
  DocumentStatusPayload,
  IRealtimeNotifier,
} from './realtime-notifier.interface';

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
})
export class SocketNotificationGateway
  implements IRealtimeNotifier, OnGatewayConnection
{
  private readonly logger = new Logger(SocketNotificationGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly userRepository: IUserRepository,
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      client.disconnect();
      return;
    }

    const userIdResult = await this.userRepository.GetUserIdByPublicId(
      payload.sub,
    );
    if (userIdResult.isErr() || userIdResult.value === null) {
      client.disconnect();
      return;
    }

    const spaceIdsResult =
      await this.knowledgeSpaceRepository.getKnowledgeSpaceIdsForUser(
        userIdResult.value,
      );
    if (spaceIdsResult.isErr()) {
      this.logger.warn(
        `Failed to resolve knowledge spaces for socket ${client.id}: ${spaceIdsResult.error}`,
      );
      client.disconnect();
      return;
    }

    for (const knowledgeSpaceId of spaceIdsResult.value) {
      await client.join(`ks:${knowledgeSpaceId}`);
    }
  }

  notifyDocumentStatus(
    knowledgeSpaceId: number,
    payload: DocumentStatusPayload,
  ): void {
    try {
      this.server
        .to(`ks:${knowledgeSpaceId}`)
        .emit('document.status.updated', payload);
    } catch (error) {
      this.logger.warn(
        `Failed to broadcast document status for knowledge space ${knowledgeSpaceId}: ${error}`,
      );
    }
  }
}
