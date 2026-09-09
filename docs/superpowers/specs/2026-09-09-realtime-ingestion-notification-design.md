# Realtime notification for document ingestion/embedding status

Date: 2026-09-09
Status: Approved (design), pending implementation plan

## Problem

Document ingestion/embedding runs async on `IngestionQueue` (BullMQ). Clients
currently have no way to know a document finished processing (`Ready` /
`Failed`) except polling. We want the members of a knowledge space to be
notified in realtime when a document's ingestion status changes.

## Scope

- Only `document.status.updated` (`Ready` / `Failed`) is in scope. No general
  multi-event notification bus — the interface is kept small but shaped so
  another event type can be added later without a redesign.
- No dynamic/manual room subscription API — clients are auto-joined to every
  knowledge space they are a member of when the socket connects.
- No horizontal-scale load testing; a Redis-backed Socket.IO adapter is wired
  in from the start (cheap, reuses existing `REDIS_URL`) so scaling out later
  needs no redesign, but multi-instance behavior itself is not tested here.

## Architecture

New code lives in `src/shared/infrastructure/notification/` (existing
cross-feature notification concern — same place as `NotificationService`),
not a new feature module.

New dependencies: `@nestjs/websockets`, `@nestjs/platform-socket.io`,
`socket.io`, `@socket.io/redis-adapter`.

```
ContentIngestionService (rag module, BullMQ worker)
        │  document.knowledgeSpaceId, knowledgeSpacePublicId already in hand
        ▼
IRealtimeNotifier.notifyDocumentStatus(knowledgeSpaceId, payload)
        │  (shared/infrastructure/notification interface, DI)
        ▼
SocketNotificationGateway (implements IRealtimeNotifier)
        │  server.to(`ks:${knowledgeSpaceId}`).emit('document.status.updated', payload)
        ▼
Socket.IO room "ks:<internal knowledgeSpaceId>"
        │  (Redis adapter fans out across instances)
        ▼
Connected clients that are members of that knowledge space
```

## Components

### 1. `IRealtimeNotifier` (interface)

```ts
// src/shared/infrastructure/notification/realtime-notifier.interface.ts
export type DocumentStatusPayload = {
  documentPublicId: string;
  knowledgeSpacePublicId: string;
  fileName: string;
  status: 'Ready' | 'Failed';
  updatedAt: string; // ISO
};

export abstract class IRealtimeNotifier {
  abstract notifyDocumentStatus(
    knowledgeSpaceId: number,
    payload: DocumentStatusPayload,
  ): void;
}
```

Fire-and-forget: returns `void`, never throws, never returns a `Result`.
Realtime notification is best-effort UX sugar, not a business-critical path —
it must never affect whether an ingestion job succeeds, fails, or retries.

### 2. `SocketNotificationGateway`

`@WebSocketGateway({ namespace: '/realtime', cors: { ... } })`, implements
`IRealtimeNotifier`, lives in `NotificationModule`, which exports
`IRealtimeNotifier` for other modules to inject.

**`handleConnection(client)`:**

1. Read JWT from `client.handshake.auth.token` (not a query string, to avoid
   leaking it into access logs).
2. Verify via `JwtService` (same verification the HTTP `JwtAuthGuard` uses,
   reimplemented for the WS handshake — `JwtAuthGuard` itself is HTTP-only).
3. On invalid/missing token: `client.disconnect()` immediately, no error
   detail emitted back.
4. On success: call `IKnowledgeSpaceRepository.getKnowledgeSpaceIdsForUser`
   (new repo method, see below) and `client.join(`ks:${id}`)` for every
   knowledge space the user belongs to.
5. If the repo lookup itself errors: disconnect safely, log, no throw.

Room keys use the **internal** `knowledgeSpaceId` (int), never the
`publicId` — the room name is a server-side-only grouping mechanism and is
never exposed to clients, which avoids an extra publicId lookup both at
join time and at emit time (the ingestion worker already has the internal id
on hand).

**No dynamic re-join:** if a user is added to a new knowledge space while
their socket is already connected, they start receiving that space's events
only after reconnecting. Acceptable — not a requirement today.

**`notifyDocumentStatus`:**

```ts
this.server
  .to(`ks:${knowledgeSpaceId}`)
  .emit('document.status.updated', payload);
```

### 3. New repository method

`IKnowledgeSpaceRepository.getKnowledgeSpaceIdsForUser(userId): Promise<Result<number[], Error>>`
— returns internal ids of every knowledge space the user is a member of.
Implemented in the Prisma repo alongside the module's existing methods.

### 4. `DocumentIngestionData` gains `knowledgeSpacePublicId`

`IDocumentRepository.getDocumentIngestionDataByPublicId` currently returns
`knowledgeSpaceId` (internal) only. Extend `DocumentIngestionData` with
`knowledgeSpacePublicId: string`, joined in the same Prisma query (no extra
round trip). Both call sites that need to build a `DocumentStatusPayload`
(`ContentIngestionService.process` and `.onFailed`) already fetch this
record, so the public id comes along for free.

### 5. Wiring

- `NotificationModule` provides `SocketNotificationGateway` bound to
  `IRealtimeNotifier` and exports it.
- `RagModule` imports `NotificationModule` and injects `IRealtimeNotifier`
  into `ContentIngestionService` — standard Nest module-import DI, matching
  how other cross-module dependencies are wired in this repo. No `@Global`
  needed.
- Redis adapter attached in `main.ts` bootstrap via `@socket.io/redis-adapter`
  `createAdapter`, using two Redis clients (pub/sub) pointed at the same
  `REDIS_URL` already used for BullMQ.

## Emission points

In `ContentIngestionService` (`src/modules/rag/application/services/content-ingestion.service.ts`):

- `process()`: right after `updateDocumentStatus(document.id, Ready)`
  succeeds, call `notifyDocumentStatus(document.knowledgeSpaceId, { documentPublicId: job.data.documentPublicId, knowledgeSpacePublicId: document.knowledgeSpacePublicId, fileName: document.fileName, status: 'Ready', updatedAt: new Date().toISOString() })`.
- `onFailed()`: same shape after `updateDocumentStatus(..., Failed)` succeeds,
  with `status: 'Failed'`.
- If `updateDocumentStatus` itself errors, the existing throw/return path is
  unchanged — the notifier is never called in that case (no phantom
  "succeeded" notification for a status update that didn't persist).

## Error handling

- Emit failures (Redis or socket.io errors) are caught and logged
  (`Logger.warn`) inside the gateway; they never propagate and never cause a
  BullMQ job retry.
- A client that's disconnected at emit time is a no-op via Socket.IO's normal
  behavior — REST remains the source of truth; WS is a UX optimization only.
- No dead-lettering or retry for notification delivery.

## Testing

**Unit:**

- `SocketNotificationGateway.notifyDocumentStatus` emits to the correct room
  with the correct payload (mocked `Server`).
- `handleConnection`: valid token → joins exactly the rooms returned by
  `getKnowledgeSpaceIdsForUser`; missing/invalid token → disconnects, joins
  nothing; repo lookup returns `err` → disconnects safely, no throw.
- `ContentIngestionService`: notifier called with the expected payload after
  a successful status update in both `process()` (`Ready`) and `onFailed()`
  (`Failed`); notifier **not** called when `updateDocumentStatus` itself
  errors.

**E2E (`test/jest-e2e.json`):**

- `socket.io-client` connects with a valid JWT for a user in a seeded
  knowledge space; triggering that space's ingestion job results in the
  client receiving `document.status.updated`.
- Negative case: a client authenticated as a user with no membership in the
  relevant knowledge space receives nothing when that space's document
  finishes ingesting (room isolation).

**Out of scope:** load/stress testing of concurrent connections; testing
actual multi-instance fan-out through the Redis adapter (trusted to behave
per `@socket.io/redis-adapter`'s own guarantees).
