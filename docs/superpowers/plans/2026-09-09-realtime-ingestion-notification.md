# Realtime Document Ingestion Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify every member of a knowledge space in realtime, over WebSocket, when a document finishes ingestion/embedding (`Ready` or `Failed`).

**Architecture:** A Socket.IO gateway (`SocketNotificationGateway`) lives under `shared/infrastructure/notification`, auto-joins each authenticated socket to a room per knowledge space the user is a member of, and is invoked through a small `IRealtimeNotifier` interface by `ContentIngestionService` (the BullMQ worker that already flips document status to `Ready`/`Failed`). A Redis-backed Socket.IO adapter (reusing the existing `REDIS_URL`) is wired in from the start so the design survives horizontal scaling later without rework.

**Tech Stack:** NestJS 11, `@nestjs/websockets` + `@nestjs/platform-socket.io` + `socket.io` (new), `@socket.io/redis-adapter` + `ioredis` (adapter reuses the Redis instance already used for BullMQ), `neverthrow` `Result` for repo methods, Jest for unit tests, `socket.io-client` (new, dev-only) for the e2e test.

**Spec:** `docs/superpowers/specs/2026-09-09-realtime-ingestion-notification-design.md`

## Global Constraints

- Namespace: `/realtime`. Event name: `document.status.updated`.
- Room key is the **internal** `knowledgeSpaceId` (`Int`), formatted as `` `ks:${knowledgeSpaceId}` `` — never the public UUID. The room name is never exposed to clients.
- Auth: JWT read from `client.handshake.auth.token` (never a query string), verified with the app's existing `JwtService` (same `JWT_SECRET` the HTTP `JwtAuthGuard` uses).
- Auto-join only: clients join every knowledge space room they're a member of at connect time. No client-driven join/subscribe API.
- `IRealtimeNotifier.notifyDocumentStatus` returns `void`, never throws, and is never allowed to affect whether a BullMQ ingestion job succeeds/fails/retries.
- Redis adapter reuses the existing `REDIS_URL` env var (same one `QueueModule` uses for BullMQ).
- New runtime deps: `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@socket.io/redis-adapter`. New dev dep: `socket.io-client`.

---

### Task 1: `DocumentIngestionData` gains `knowledgeSpacePublicId`

**Files:**

- Modify: `src/modules/document/domain/repositories/document.repo.interface.ts`
- Modify: `src/modules/document/infrastructure/document.repo.ts`
- Test: `src/modules/document/infrastructure/document.repo.spec.ts` (new)

**Interfaces:**

- Produces: `DocumentIngestionData` gains a required `knowledgeSpacePublicId: string` field, consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `src/modules/document/infrastructure/document.repo.spec.ts`:

```ts
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { DocumentRepository } from './document.repo';

describe('DocumentRepository.getDocumentIngestionDataByPublicId', () => {
  it('includes the knowledge space public id alongside the document data', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 42,
      storagePath: 'docs/42.pdf',
      title: 'Handbook.pdf',
      status: 'Ready',
      visibility: 'Public',
      content: null,
      knowledgeSpaceId: 7,
      fileType: 'PDF',
      knowledgeSpace: { publicId: 'ks-public-id-123' },
    });
    const prismaService = {
      document: { findUnique },
    } as unknown as PrismaService;
    const repository = new DocumentRepository(prismaService);

    const result =
      await repository.getDocumentIngestionDataByPublicId('doc-public-id');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toMatchObject({
        knowledgeSpaceId: 7,
        knowledgeSpacePublicId: 'ks-public-id-123',
      });
    }
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publicId: 'doc-public-id' },
        select: expect.objectContaining({
          knowledgeSpace: { select: { publicId: true } },
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- document.repo.spec.ts`
Expected: FAIL — `result.value.knowledgeSpacePublicId` is `undefined` (not yet selected/mapped), and the `findUnique` assertion fails because `knowledgeSpace` isn't in `select` yet.

- [ ] **Step 3: Implement**

In `src/modules/document/domain/repositories/document.repo.interface.ts`, add the field:

```ts
export type DocumentIngestionData = {
  id: number;
  knowledgeSpaceId: number;
  knowledgeSpacePublicId: string;
  storagePath: string;
  fileName: string;
  content: string | null;
  status: CommonDocumentStatus;
  visibility: CommonDocumentVisibility;
  fileType: CommonDocumentType;
};
```

In `src/modules/document/infrastructure/document.repo.ts`, update `getDocumentIngestionDataByPublicId`:

```ts
  async getDocumentIngestionDataByPublicId(
    publicId: string,
  ): Promise<Result<DocumentIngestionData | null, Error>> {
    try {
      const document = await this.prismaService.document.findUnique({
        where: { publicId },
        select: {
          id: true,
          storagePath: true,
          title: true,
          status: true,
          visibility: true,
          content: true,
          knowledgeSpaceId: true,
          fileType: true,
          knowledgeSpace: { select: { publicId: true } },
        },
      });
      if (!document) {
        return ok(null);
      }
      return ok({
        id: document.id,
        knowledgeSpaceId: document.knowledgeSpaceId,
        knowledgeSpacePublicId: document.knowledgeSpace.publicId,
        storagePath: document.storagePath,
        fileName: document.title,
        content: document.content,
        status: toDomainStatus(document.status),
        visibility: toDomainVisibility(document.visibility),
        fileType: toDomainType(document.fileType),
      });
    } catch (error) {
```

(leave the existing `catch` block as-is)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- document.repo.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/document/domain/repositories/document.repo.interface.ts src/modules/document/infrastructure/document.repo.ts src/modules/document/infrastructure/document.repo.spec.ts
git commit -m "feat(document): include knowledge space public id in ingestion data"
```

---

### Task 2: `IKnowledgeSpaceRepository.getKnowledgeSpaceIdsForUser`

**Files:**

- Modify: `src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface.ts`
- Modify: `src/modules/knowledge-space/infrastructure/knowledgeSpace.repo.ts`
- Test: `src/modules/knowledge-space/infrastructure/knowledgeSpace.repo.spec.ts` (new)

**Interfaces:**

- Produces: `IKnowledgeSpaceRepository.getKnowledgeSpaceIdsForUser(userId: number): Promise<Result<number[], Error>>` — returns the **internal** ids (not public ids) of every knowledge space the user belongs to (via the `user_workspace` join table). Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `src/modules/knowledge-space/infrastructure/knowledgeSpace.repo.spec.ts`:

```ts
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { KnowledgeSpaceRepository } from './knowledgeSpace.repo';

describe('KnowledgeSpaceRepository.getKnowledgeSpaceIdsForUser', () => {
  it('returns the internal ids of every knowledge space the user belongs to', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ knowledgeSpaceId: 7 }, { knowledgeSpaceId: 12 }]);
    const prismaService = {
      userWorkspace: { findMany },
    } as unknown as PrismaService;
    const repository = new KnowledgeSpaceRepository(prismaService);

    const result = await repository.getKnowledgeSpaceIdsForUser(3);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([7, 12]);
    }
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 3 },
      select: { knowledgeSpaceId: true },
    });
  });

  it('wraps a Prisma error as a Result error instead of throwing', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('connection lost'));
    const prismaService = {
      userWorkspace: { findMany },
    } as unknown as PrismaService;
    const repository = new KnowledgeSpaceRepository(prismaService);

    const result = await repository.getKnowledgeSpaceIdsForUser(3);

    expect(result.isErr()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- knowledgeSpace.repo.spec.ts`
Expected: FAIL — `getKnowledgeSpaceIdsForUser` does not exist on `KnowledgeSpaceRepository`.

- [ ] **Step 3: Implement**

In `src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface.ts`, add to the abstract class (after `getKnowledgeSpaceNameById`):

```ts
  abstract getKnowledgeSpaceIdsForUser(
    userId: number,
  ): Promise<Result<number[], Error>>;
```

In `src/modules/knowledge-space/infrastructure/knowledgeSpace.repo.ts`, add a new method just before the class's closing brace (after `updateKnowledgeSpace`):

```ts
  async getKnowledgeSpaceIdsForUser(
    userId: number,
  ): Promise<Result<number[], Error>> {
    try {
      const memberships = await this.prismaService.userWorkspace.findMany({
        where: { userId },
        select: { knowledgeSpaceId: true },
      });
      return ok(memberships.map((membership) => membership.knowledgeSpaceId));
    } catch (error) {
      this.logger.error(
        'Failed to get knowledge space ids for user in repository',
        error,
      );
      return err(new Error('Failed to get knowledge space ids for user'));
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- knowledgeSpace.repo.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface.ts src/modules/knowledge-space/infrastructure/knowledgeSpace.repo.ts src/modules/knowledge-space/infrastructure/knowledgeSpace.repo.spec.ts
git commit -m "feat(knowledge-space): add getKnowledgeSpaceIdsForUser repository method"
```

---

### Task 3: `IRealtimeNotifier` interface & `SocketNotificationGateway`

**Files:**

- Create: `src/shared/common/cors.ts`
- Modify: `src/main.ts` (use the new constant instead of the inline origin array)
- Create: `src/shared/infrastructure/notification/realtime-notifier.interface.ts`
- Create: `src/shared/infrastructure/notification/socket-notification.gateway.ts`
- Test: `src/shared/infrastructure/notification/socket-notification.gateway.spec.ts` (new)
- Modify: `src/shared/infrastructure/notification/notification.module.ts`

**Interfaces:**

- Consumes: `IKnowledgeSpaceRepository.getKnowledgeSpaceIdsForUser` (Task 2), `IUserRepository.GetUserIdByPublicId(publicId: string): Promise<Result<number | null, Error>>` (existing), `JwtService.verifyAsync<T>(token: string): Promise<T>` (existing, globally available via `AuthModule`'s `@Global()` export).
- Produces: `IRealtimeNotifier.notifyDocumentStatus(knowledgeSpaceId: number, payload: DocumentStatusPayload): void`, `DocumentStatusPayload` type, `ALLOWED_ORIGINS` constant. Consumed by Task 4 (adapter attaches to the same Socket.IO server) and Task 5 (`ContentIngestionService` injects `IRealtimeNotifier`).

- [ ] **Step 1: Install dependencies**

Run: `npm install @nestjs/websockets @nestjs/platform-socket.io socket.io @socket.io/redis-adapter`

- [ ] **Step 2: Extract the shared CORS origin list**

Create `src/shared/common/cors.ts`:

```ts
export const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
];
```

In `src/main.ts`, replace the inline array in `app.enableCors`:

```ts
import { ALLOWED_ORIGINS } from './shared/common/cors';
```

```ts
app.enableCors({
  origin: ALLOWED_ORIGINS, // default react dev server port
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
});
```

- [ ] **Step 3: Write the failing gateway test**

Create `src/shared/infrastructure/notification/socket-notification.gateway.spec.ts`:

```ts
import { err, ok } from 'neverthrow';
import { SocketNotificationGateway } from './socket-notification.gateway';

function createSocket(token?: string) {
  return {
    id: 'socket-1',
    handshake: { auth: { token } },
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  } as any;
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
      jwtService as any,
      userRepository as any,
      knowledgeSpaceRepository as any,
    );
  });

  describe('handleConnection', () => {
    it('joins a room for every knowledge space the authenticated user belongs to', async () => {
      const socket = createSocket('valid-token');
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

      expect(socket.join).toHaveBeenCalledWith('ks:7');
      expect(socket.join).toHaveBeenCalledWith('ks:12');
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects a socket with no auth token', async () => {
      const socket = createSocket(undefined);

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalled();
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('disconnects a socket with an invalid token', async () => {
      const socket = createSocket('bad-token');
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('disconnects safely when the knowledge space lookup fails', async () => {
      const socket = createSocket('valid-token');
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

      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('notifyDocumentStatus', () => {
    it('emits the payload to the room for the given knowledge space', () => {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      (gateway as any).server = { to };

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
      (gateway as any).server = { to };

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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- socket-notification.gateway.spec.ts`
Expected: FAIL — `./socket-notification.gateway` does not exist yet.

- [ ] **Step 5: Implement the interface**

Create `src/shared/infrastructure/notification/realtime-notifier.interface.ts`:

```ts
export type DocumentStatusPayload = {
  documentPublicId: string;
  knowledgeSpacePublicId: string;
  fileName: string;
  status: 'Ready' | 'Failed';
  updatedAt: string;
};

export abstract class IRealtimeNotifier {
  abstract notifyDocumentStatus(
    knowledgeSpaceId: number,
    payload: DocumentStatusPayload,
  ): void;
}
```

- [ ] **Step 6: Implement the gateway**

Create `src/shared/infrastructure/notification/socket-notification.gateway.ts`:

```ts
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
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- socket-notification.gateway.spec.ts`
Expected: PASS

- [ ] **Step 8: Wire the gateway into `NotificationModule`**

In `src/shared/infrastructure/notification/notification.module.ts`, add imports and register the provider:

```ts
import { IRealtimeNotifier } from './realtime-notifier.interface';
import { SocketNotificationGateway } from './socket-notification.gateway';
```

```ts
  providers: [
    NotificationService,
    SendEmailService,
    {
      provide: IRealtimeNotifier,
      useClass: SocketNotificationGateway,
    },
  ],
  exports: [MailerModule, NotificationService, IRealtimeNotifier],
```

(`NotificationModule` is already `@Global()` and already imports `KnowledgeSpaceModule` and `UserModule`, which is everything `SocketNotificationGateway` needs besides `JwtService` — `JwtService` is already globally available via `AuthModule`'s `@Global()` export, so no further import is required.)

- [ ] **Step 9: Run the full unit suite and build**

Run: `npm test`
Expected: PASS (all suites, including the two new ones)

Run: `npm run build`
Expected: succeeds with no TypeScript errors

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/main.ts src/shared/common/cors.ts src/shared/infrastructure/notification/realtime-notifier.interface.ts src/shared/infrastructure/notification/socket-notification.gateway.ts src/shared/infrastructure/notification/socket-notification.gateway.spec.ts src/shared/infrastructure/notification/notification.module.ts
git commit -m "feat(notification): add realtime Socket.IO gateway for knowledge space members"
```

---

### Task 4: Redis-backed Socket.IO adapter

**Files:**

- Create: `src/shared/infrastructure/notification/redis-io.adapter.ts`
- Modify: `src/main.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks directly — attaches to whatever Socket.IO server Nest creates for the app (including the `/realtime` gateway from Task 3).
- Produces: nothing consumed by later tasks — this is bootstrap wiring, verified manually rather than by a later task's code.

This task has no automated test: it wires the process bootstrap (`main.ts`) to a live Redis connection, matching how this repo already leaves `PrismaService`'s and `QueueModule`'s bootstrap-time connection setup untested — there's no way to unit test "does the real Socket.IO server pick up a real Redis adapter" without a live server and a live Redis, which is what the Task 6 e2e test exercises indirectly. Verification here is a manual smoke check instead of a Jest run.

- [ ] **Step 1: Implement the adapter**

Create `src/shared/infrastructure/notification/redis-io.adapter.ts`:

```ts
import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { ServerOptions, Server } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  connectToRedis(redisUrl: string): void {
    const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
```

- [ ] **Step 2: Attach it in `main.ts`**

Add the import:

```ts
import { ConfigService } from '@nestjs/config';
import { RedisIoAdapter } from './shared/infrastructure/notification/redis-io.adapter';
```

Inside `bootstrap()`, right after `const app = await NestFactory.create(AppModule);`:

```ts
const configService = app.get(ConfigService);
const redisIoAdapter = new RedisIoAdapter(app);
redisIoAdapter.connectToRedis(configService.getOrThrow<string>('REDIS_URL'));
app.useWebSocketAdapter(redisIoAdapter);
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors

- [ ] **Step 4: Verify manually**

Run: `npm run start:dev`
Expected: the server starts with no errors related to Redis/Socket.IO in the log output (confirms the adapter connected without throwing). Stop the server after confirming.

- [ ] **Step 5: Commit**

```bash
git add src/shared/infrastructure/notification/redis-io.adapter.ts src/main.ts
git commit -m "feat(notification): attach Redis-backed Socket.IO adapter"
```

---

### Task 5: Emit `document.status.updated` from `ContentIngestionService`

**Files:**

- Modify: `src/modules/rag/application/services/content-ingestion.service.ts`
- Test: `src/modules/rag/application/services/content-ingestion.service.spec.ts` (new)

**Interfaces:**

- Consumes: `IRealtimeNotifier.notifyDocumentStatus` (Task 3), `DocumentIngestionData.knowledgeSpacePublicId` (Task 1).
- Produces: nothing consumed by a later task in this plan.

`RagModule` needs **no** change: `NotificationModule` is `@Global()` and already imported once (in `AppModule`), so `IRealtimeNotifier` is injectable into `ContentIngestionService` without `RagModule` importing `NotificationModule` itself — the same reason `JwtAuthGuard` works in every controller without every module importing `AuthModule`.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/rag/application/services/content-ingestion.service.spec.ts`:

```ts
import { Job } from 'bullmq';
import { err, ok } from 'neverthrow';
import {
  CommonDocumentStatus,
  CommonDocumentType,
  CommonDocumentVisibility,
} from 'src/shared/domain/enum';
import { ContentIngestionService } from './content-ingestion.service';

function createDeps() {
  return {
    documentRepository: {
      getDocumentIngestionDataByPublicId: jest.fn(),
      updateDocumentStatus: jest.fn(),
    },
    embeddingService: { generateEmbeddings: jest.fn() },
    documentChunkRepository: { addChunks: jest.fn() },
    chunkService: { chunkText: jest.fn() },
    fileIngestionService: { extractText: jest.fn() },
    realtimeNotifier: { notifyDocumentStatus: jest.fn() },
  };
}

function createService(deps: ReturnType<typeof createDeps>) {
  return new ContentIngestionService(
    deps.documentRepository as any,
    deps.embeddingService as any,
    deps.documentChunkRepository as any,
    deps.chunkService as any,
    deps.fileIngestionService as any,
    deps.realtimeNotifier as any,
  );
}

const baseDocument = {
  id: 42,
  knowledgeSpaceId: 7,
  knowledgeSpacePublicId: 'ks-public-id',
  storagePath: 'docs/42.pdf',
  fileName: 'Handbook.pdf',
  content: 'plain text content',
  status: CommonDocumentStatus.Processing,
  visibility: CommonDocumentVisibility.Public,
  fileType: CommonDocumentType.TXT,
};

describe('ContentIngestionService', () => {
  describe('process', () => {
    it('notifies Ready after the document status update succeeds', async () => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.chunkService.chunkText.mockReturnValue([
        { chunkIndex: 0, content: 'chunk', tokens: 3 },
      ]);
      deps.embeddingService.generateEmbeddings.mockResolvedValue(
        ok([[0.1, 0.2]]),
      );
      deps.documentChunkRepository.addChunks.mockResolvedValue(ok(undefined));
      deps.documentRepository.updateDocumentStatus.mockResolvedValue(
        ok(undefined),
      );
      const service = createService(deps);

      await service.process({
        data: { documentPublicId: 'doc-public-id' },
      } as Job<any>);

      expect(deps.realtimeNotifier.notifyDocumentStatus).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          documentPublicId: 'doc-public-id',
          knowledgeSpacePublicId: 'ks-public-id',
          fileName: 'Handbook.pdf',
          status: 'Ready',
        }),
      );
    });

    it('does not notify when the status update fails', async () => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.chunkService.chunkText.mockReturnValue([
        { chunkIndex: 0, content: 'chunk', tokens: 3 },
      ]);
      deps.embeddingService.generateEmbeddings.mockResolvedValue(
        ok([[0.1, 0.2]]),
      );
      deps.documentChunkRepository.addChunks.mockResolvedValue(ok(undefined));
      deps.documentRepository.updateDocumentStatus.mockResolvedValue(
        err(new Error('db down')),
      );
      const service = createService(deps);

      await expect(
        service.process({
          data: { documentPublicId: 'doc-public-id' },
        } as Job<any>),
      ).rejects.toThrow();
      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('notifies Failed once retries are exhausted and the status update succeeds', async () => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.documentRepository.updateDocumentStatus.mockResolvedValue(
        ok(undefined),
      );
      const service = createService(deps);
      const job = {
        data: { documentPublicId: 'doc-public-id' },
        opts: { attempts: 1 },
        attemptsMade: 1,
      } as unknown as Job<any>;

      await service.onFailed(job);

      expect(deps.realtimeNotifier.notifyDocumentStatus).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          status: 'Failed',
          documentPublicId: 'doc-public-id',
          knowledgeSpacePublicId: 'ks-public-id',
        }),
      );
    });

    it('does not notify when retries are not yet exhausted', async () => {
      const deps = createDeps();
      const service = createService(deps);
      const job = {
        data: { documentPublicId: 'doc-public-id' },
        opts: { attempts: 3 },
        attemptsMade: 1,
      } as unknown as Job<any>;

      await service.onFailed(job);

      expect(
        deps.documentRepository.getDocumentIngestionDataByPublicId,
      ).not.toHaveBeenCalled();
      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
    });

    it('does not notify when the status update itself fails', async () => {
      const deps = createDeps();
      deps.documentRepository.getDocumentIngestionDataByPublicId.mockResolvedValue(
        ok(baseDocument),
      );
      deps.documentRepository.updateDocumentStatus.mockResolvedValue(
        err(new Error('db down')),
      );
      const service = createService(deps);
      const job = {
        data: { documentPublicId: 'doc-public-id' },
        opts: { attempts: 1 },
        attemptsMade: 1,
      } as unknown as Job<any>;

      await service.onFailed(job);

      expect(deps.realtimeNotifier.notifyDocumentStatus).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- content-ingestion.service.spec.ts`
Expected: FAIL — `ContentIngestionService`'s constructor doesn't accept a 6th `realtimeNotifier` argument yet (TS compile error under `ts-jest`), and `notifyDocumentStatus` is never called.

- [ ] **Step 3: Implement**

In `src/modules/rag/application/services/content-ingestion.service.ts`, add the import:

```ts
import { IRealtimeNotifier } from 'src/shared/infrastructure/notification/realtime-notifier.interface';
```

Update the constructor:

```ts
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly embeddingService: IEmbeddingClient,
    private readonly documentChunkRepository: IDocumentChunkRepository,
    private readonly chunkService: ChunkingService,
    private readonly fileIngestionService: FileIngestionService,
    private readonly realtimeNotifier: IRealtimeNotifier,
  ) {
    super();
  }
```

At the end of `process()`, after the existing status-update `if` block:

```ts
    const statusResult = await this.documentRepository.updateDocumentStatus(
      document.id,
      CommonDocumentStatus.Ready,
    );
    if (statusResult.isErr()) {
      this.logger.error(
        `Error updating status to Ready for document ${job.data.documentPublicId}: ${statusResult.error}`,
      );
      throw statusResult.error;
    }

    this.realtimeNotifier.notifyDocumentStatus(document.knowledgeSpaceId, {
      documentPublicId: job.data.documentPublicId,
      knowledgeSpacePublicId: document.knowledgeSpacePublicId,
      fileName: document.fileName,
      status: 'Ready',
      updatedAt: new Date().toISOString(),
    });
  }
```

Replace the tail of `onFailed()` (from the `await this.documentRepository.updateDocumentStatus(...)` call to the end of the method) with:

```ts
    const statusResult = await this.documentRepository.updateDocumentStatus(
      documentResult.value.id,
      CommonDocumentStatus.Failed,
    );
    if (statusResult.isErr()) {
      this.logger.error(
        `Failed to mark document ${job.data.documentPublicId} as Failed: ${statusResult.error}`,
      );
      return;
    }

    this.realtimeNotifier.notifyDocumentStatus(
      documentResult.value.knowledgeSpaceId,
      {
        documentPublicId: job.data.documentPublicId,
        knowledgeSpacePublicId: documentResult.value.knowledgeSpacePublicId,
        fileName: documentResult.value.fileName,
        status: 'Failed',
        updatedAt: new Date().toISOString(),
      },
    );
  }
```

(This also fixes a pre-existing gap: `onFailed` previously ignored the `Result` from `updateDocumentStatus` entirely. Checking it is required so the notifier is never called for a status update that didn't actually persist.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- content-ingestion.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the full unit suite and build**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: succeeds with no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/modules/rag/application/services/content-ingestion.service.ts src/modules/rag/application/services/content-ingestion.service.spec.ts
git commit -m "feat(rag): broadcast document ingestion status over realtime notifier"
```

---

### Task 6: E2E test — connection auth & room isolation

**Files:**

- Create: `test/realtime-notification.e2e-spec.ts`

**Interfaces:**

- Consumes: `SocketNotificationGateway`/`IRealtimeNotifier` (Task 3), `RedisIoAdapter` (Task 4, implicitly — the running app already has it attached via `main.ts`... actually via `AppModule` bootstrap in the test, see note below).

**Note:** This test boots `AppModule` via `Test.createTestingModule` the same way `test/app.e2e-spec.ts` already does, and does **not** re-run `main.ts`'s `bootstrap()` — so the Redis adapter from Task 4 is not attached in this test process. That's fine: Socket.IO works correctly as a single in-memory adapter within one process, which is exactly what this test exercises. The Redis adapter's cross-instance fan-out is explicitly out of scope for testing per the spec.

This test triggers the notification by calling `IRealtimeNotifier.notifyDocumentStatus` directly (fetched from the test app's DI container) rather than running a full ingestion job end-to-end — the full pipeline requires mocking the embedding client and file storage, which is unrelated to what this test verifies (socket auth and room isolation). `ContentIngestionService`'s own unit tests (Task 5) already prove it calls the notifier correctly.

- [ ] **Step 1: Install the client dependency**

Run: `npm install -D socket.io-client`

- [ ] **Step 2: Write the test**

Create `test/realtime-notification.e2e-spec.ts`:

```ts
import { randomUUID } from 'crypto';
import { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { WorkSpaceRole } from 'generated/prisma/enums';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { SystemRole } from '../src/shared/domain/enum';
import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';
import { IRealtimeNotifier } from '../src/shared/infrastructure/notification/realtime-notifier.interface';

describe('Realtime document status notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let realtimeNotifier: IRealtimeNotifier;
  let baseUrl: string;

  let memberUserId: number;
  let memberUserPublicId: string;
  let outsiderUserId: number;
  let outsiderUserPublicId: string;
  let knowledgeSpaceId: number;
  let knowledgeSpaceTypeId: number;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    realtimeNotifier = app.get(IRealtimeNotifier);

    const type = await prisma.knowledgeSpaceType.create({
      data: { name: `e2e-realtime-${randomUUID()}` },
    });
    knowledgeSpaceTypeId = type.id;

    const space = await prisma.knowledgeSpace.create({
      data: {
        name: `e2e-realtime-space-${randomUUID()}`,
        typeId: knowledgeSpaceTypeId,
      },
    });
    knowledgeSpaceId = space.id;

    const memberUser = await prisma.user.create({
      data: {
        username: 'realtime-member',
        email: `realtime-member-${randomUUID()}@example.com`,
        password: 'not-used',
      },
    });
    memberUserId = memberUser.id;
    memberUserPublicId = memberUser.publicId;

    const outsiderUser = await prisma.user.create({
      data: {
        username: 'realtime-outsider',
        email: `realtime-outsider-${randomUUID()}@example.com`,
        password: 'not-used',
      },
    });
    outsiderUserId = outsiderUser.id;
    outsiderUserPublicId = outsiderUser.publicId;

    await prisma.userWorkspace.create({
      data: {
        userId: memberUserId,
        knowledgeSpaceId,
        role: WorkSpaceRole.Viewer,
      },
    });
  });

  afterAll(async () => {
    await prisma.userWorkspace.deleteMany({ where: { knowledgeSpaceId } });
    await prisma.knowledgeSpace.delete({ where: { id: knowledgeSpaceId } });
    await prisma.knowledgeSpaceType.delete({
      where: { id: knowledgeSpaceTypeId },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [memberUserId, outsiderUserId] } },
    });
    await app.close();
  });

  afterEach(() => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    sockets.length = 0;
  });

  function connect(userPublicId: string): Socket {
    const token = jwtService.sign({
      email: 'irrelevant@example.com',
      sub: userPublicId,
      role: SystemRole.Employee,
    });
    const socket = io(`${baseUrl}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  }

  function waitForConnect(socket: Socket): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
  }

  it('delivers document.status.updated to a member of the knowledge space', async () => {
    const socket = connect(memberUserPublicId);
    await waitForConnect(socket);

    const received = new Promise((resolve) => {
      socket.on('document.status.updated', resolve);
    });

    realtimeNotifier.notifyDocumentStatus(knowledgeSpaceId, {
      documentPublicId: 'doc-1',
      knowledgeSpacePublicId: 'ks-1',
      fileName: 'Handbook.pdf',
      status: 'Ready',
      updatedAt: new Date().toISOString(),
    });

    await expect(received).resolves.toMatchObject({
      documentPublicId: 'doc-1',
      status: 'Ready',
    });
  });

  it('does not deliver the event to a user outside the knowledge space', async () => {
    const memberSocket = connect(memberUserPublicId);
    const outsiderSocket = connect(outsiderUserPublicId);
    await Promise.all([
      waitForConnect(memberSocket),
      waitForConnect(outsiderSocket),
    ]);

    const outsiderReceived = jest.fn();
    outsiderSocket.on('document.status.updated', outsiderReceived);
    const memberReceived = new Promise((resolve) => {
      memberSocket.on('document.status.updated', resolve);
    });

    realtimeNotifier.notifyDocumentStatus(knowledgeSpaceId, {
      documentPublicId: 'doc-2',
      knowledgeSpacePublicId: 'ks-1',
      fileName: 'Handbook.pdf',
      status: 'Failed',
      updatedAt: new Date().toISOString(),
    });

    await memberReceived;
    // Give a same-process event loop tick for a wrongly-routed event to
    // arrive before asserting its absence.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outsiderReceived).not.toHaveBeenCalled();
  });

  it('disconnects a socket that connects without a valid token', async () => {
    const socket = io(`${baseUrl}/realtime`, {
      auth: { token: 'not-a-real-token' },
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(socket);

    await new Promise<void>((resolve) => {
      socket.on('disconnect', () => resolve());
    });
  });
});
```

- [ ] **Step 3: Run the e2e test**

Run: `npm run test:e2e -- realtime-notification.e2e-spec.ts`
Expected: PASS. This requires a reachable Postgres at `DATABASE_URL`/`DIRECT_URL` and Redis at `REDIS_URL` (same as any other e2e run in this repo — see `test/app.e2e-spec.ts`'s existing requirements).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json test/realtime-notification.e2e-spec.ts
git commit -m "test(notification): add e2e coverage for realtime auth and room isolation"
```
