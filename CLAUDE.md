# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start:dev      # run with watch (http://localhost:3000, Swagger at /docs)
npm run build          # nest build — run after structural TypeScript changes
npm run lint           # eslint --fix over {src,apps,libs,test}
npm run format         # prettier --write
npm run test           # jest unit tests (*.spec.ts under src/)
npm run test:e2e       # jest with test/jest-e2e.json
```

Run a single unit test: `npx jest path/to/file.spec.ts` or `npx jest -t "test name"`.

Prisma:

```bash
npx prisma generate    # REQUIRED after clone and after editing prisma/models/*
```

`generated/prisma` is git-ignored and must be regenerated on each machine. `PrismaService` imports the client from `generated/prisma/client`; if that import fails, run `prisma generate`.

Prisma config lives in `prisma.config.ts` (not `package.json`). The schema is **split across multiple files** in `prisma/models/*.prisma` with a root `prisma/schema.prisma`; the generator points `schema = './prisma'` at the whole directory. Migrations use `DIRECT_URL` (falls back to `DATABASE_URL`).

## Git hooks (Husky)

`pre-commit` runs `npm run lint`, `pre-push` runs `npm run build`, `commit-msg` runs commitlint (Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, …). Keep commits conventional or the hook rejects them.

## Architecture

**Feature-based Clean Architecture.** Each feature lives in `src/modules/<feature>/` with strict layer boundaries and a one-directional dependency flow:

```plaintext
api  →  application  →  domain
infrastructure/repository  →  implements domain contracts
```

- **api/** — controllers only. Receive DTOs, call application services, map `AppError.code` → Nest HTTP exceptions. No business rules.
- **application/** — use-case services (`*.service.ts`), service interfaces (`interfaces/`), and DTOs (`dtos/`). Coordinates domain + repositories.
- **domain/** — entities (`entities/`) and abstract repository contracts (`repositories/`). Must NOT import Nest controllers, Prisma, infrastructure, or application services.
- **infrastructure/** (or **repository/**) — concrete external implementations: Prisma repositories, bcrypt hasher, JWT provider.

Cross-cutting code lives in `src/shared/` (`common/` for guards/filters/decorators/error types, `infrastructure/database/` for Prisma).

**Hard rules:** Controllers and application services never call Prisma directly — all DB access goes through domain repository contracts. Only classes under `infrastructure/`, `repository/`, or `shared/infrastructure/` may import `PrismaService` or generated Prisma types. Never throw Nest HTTP exceptions outside the controller layer.

### Dependency injection

Interfaces are **abstract classes** (prefixed `I`) used as injection tokens. Bind implementations in the feature module via `{ provide: IThing, useClass: Thing }` and depend on the abstract class in constructors. Import `PrismaModule`/`ConfigModule`/`JwtModule` through Nest modules rather than constructing dependencies manually.

### Error handling — `neverthrow`

Business/application and domain code uses functional `Result<T, E>` instead of throwing:

- Application methods return `Promise<Result<T, AppError>>`; entity factories return `Result<Entity, AppError | Error>`.
- Return `err(new AppError(ErrorCode.X, message))` for expected failures, `ok(value)` for success. Never `throw` for business logic.
- Infrastructure may `try/catch` external calls and convert failures to `err(new Error(...))`; application services translate those raw `Error`s into user-safe `AppError` (usually `ErrorCode.InternalServerError`) so DB/bcrypt details never reach responses.
- Controllers call `result.match(onOk, onErr)` and switch on `AppError.code` to throw the matching Nest exception. Mapping: `BadRequest→BadRequestException`, `Conflict→ConflictException`, `NotFound→NotFoundException`, `Unauthorized→UnauthorizedException`, default→`InternalServerErrorException`. `ErrorCode` is defined in `src/shared/common/errorCode.ts` — check it before inventing a new error.

## Conventions (match existing code, even when not idiomatic)

- Async service methods use an `Async` suffix: `loginAsync`, `registerAsync`.
- Repository/provider methods are **PascalCase**: `GetUserByEmail`, `AddUser`, `GenerateAccessToken`.
- Interfaces are abstract classes prefixed `I`; DTOs end in `Dto`; entities are singular (`User`).
- Domain entities use a **private constructor** + static factories (`create()` for new, `getUser()`/rehydrate for persisted); expose state via getters. Validate invariants in the entity or service, not the controller.
- All request bodies are class DTOs in `application/dtos/` with `class-validator` decorators and custom messages. Global `ValidationPipe` runs with `whitelist: true` — never accept untyped `any` bodies.
- Use `publicId` (not the internal numeric `id`) for external identifiers; never return raw passwords or numeric IDs in responses.
- Cross-module imports use `src/...` paths. Use Nest `Logger` (not `console.log`).

## Bootstrap notes

`main.ts` wires the global `ValidationPipe`, `AllExceptionsFilter`, Swagger at `/docs`, and CORS (allows `localhost:5173` and `localhost:3000`). `AppModule` registers a global `LoggerMiddleware` on `api/*` routes and a per-minute `ThrottlerModule` (`limitPerMinute-auth`, 10 req/60s) used by the auth endpoints. `AuthModule` is `@Global()` and configures `JwtModule` (1h expiry) from `JWT_SECRET_KEY`.

## Additional guidance

`.agents/` holds the project's own agent rules and skills. Before non-trivial backend changes, consult `.agents/rules/backend-architecture.md`, `.agents/rules/backend-code-style.md`, and `.agents/rules/agent-workflow.md`. Do not change Docker, Prisma migrations, or auth behavior unless the task requires it, and avoid mixing unrelated refactors into feature work.
