# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Smart Knowledge Hub — a NestJS 11 backend for an AI-assisted knowledge base ("DevNotes"): knowledge spaces containing documents that are chunked and embedded for RAG-style chat, with per-workspace roles, document permissions, chat sessions, feedback, and unanswered-question tracking. Most of the domain lives in the Prisma schema; only the `knowledge-space` module is scaffolded so far (its files are still empty stubs).

Note: the repo started from an internal NestJS template; the README and `src/modules/MODULE.README.md` are in Vietnamese.

## Commands

```bash
npm run start:dev      # watch-mode dev server (http://localhost:3000, Swagger at /docs)
npm run build          # nest build → dist/ (also the pre-push hook)
npm run lint           # eslint --fix over {src,apps,libs,test} (also the pre-commit hook)
npm run format         # prettier --write
npm test               # jest (unit; *.spec.ts under src/)
npm run test:e2e       # jest with test/jest-e2e.json
npx prisma generate    # REQUIRED after clone and after any schema change (see below)
```

Run a single test: `npm test -- path/to/file.spec.ts` or `npm test -- -t "describe or it name"`.

## Prisma — non-obvious setup

- **Schema is split across multiple files.** `prisma/schema.prisma` holds only the generator + datasource; every model lives in `prisma/models/*.prisma`. `prisma.config.ts` points Prisma at the whole `./prisma` folder (`schema: './prisma'`), so all `.prisma` files are merged. Add new models as files under `prisma/models/`.
- **The client is generated to `generated/prisma/` (gitignored), NOT `node_modules`.** Import from `generated/prisma/client`. Because it is not committed, `npx prisma generate` must run after every clone and after any schema edit — CI and the Dockerfile both run it explicitly.
- **Two connection URLs.** Runtime connects via `DATABASE_URL` (`PrismaService` builds a `pg.Pool` + `PrismaPg` adapter). Migrations/CLI use `DIRECT_URL` (falls back to `DATABASE_URL`) — `.env` is not auto-loaded by Prisma; `prisma.config.ts` imports `dotenv/config` to load it.
- Postgres with the `pgvector` extension is assumed: `DocumentChunk.embedding` is `Unsupported("vector(1536)")`.

## Architecture

### Per-module DDD layering

Each feature under `src/modules/<feature>/` is a self-contained NestJS module split into four layers (see `src/modules/MODULE.README.md`):

- `api/` — controllers; receive requests, call services.
- `application/` — `services/` (business logic), `dtos/` (with `class-validator`), `interfaces/`.
- `domain/` — `entities/`, `repositories/` (repo interfaces), `errors/` (domain errors).
- `infrastructure/` — Prisma repository implementations, mappers, external clients.

Keep feature-only code inside the feature. `src/shared/` is strictly for cross-feature code (`shared/common`, `shared/domain`, `shared/infrastructure/database`).

### Data model ID convention

Every model has both an internal `id` (`Int @default(autoincrement())`, used for FKs/joins) and a `publicId` (`String @unique @default(uuid())`, mapped to `public_id`). Expose `publicId` externally; use `id` internally. Table/column names are snake_cased via `@map`/`@@map`.

### Error handling

- Application/domain code raises `AppError(code, message)` (`src/shared/common/errorCode.ts`) where `code` is an `ErrorCode` enum value.
- `toHttpException()` (`src/shared/common/app-error.mapper.ts`) maps each `ErrorCode` to the matching Nest HTTP exception. The intended pattern (per its doc comment) is a `Result` type resolved in controllers via `result.match(...)` — note no `Result` library is installed yet, so that helper is not wired up.
- `AllExceptionsFilter` is registered globally in `main.ts` and normalizes every response to `{ statusCode, timestamp, path, message }`.

### Auth & authorization

- `JwtAuthGuard` (`shared/common/jwt.guard.ts`) verifies a `Bearer` token via `@nestjs/jwt` and attaches the `JwtPayload` (`{ email, sub, role }`) to `request.user`.
- `@User()` param decorator injects that payload into handlers.
- `RolesGuard` + the `@Roles(...)` decorator (Reflector-based, typed with `SystemRole`) gate routes by role. **`RolesGuard` throws `Forbidden` if a route has no `@Roles()` metadata** — apply the decorator whenever the guard is used. Note `SystemRole` (`shared/domain/enum.ts`: `admin`/`employee`) is separate from the Prisma `Role` enum (`Admin`/`Employee`).

### Global app wiring (`app.module.ts` / `main.ts`)

- `ConfigModule.forRoot({ isGlobal: true })`; `PrismaModule` is `@Global`, so `PrismaService` injects anywhere without re-importing.
- Global `ValidationPipe` with `whitelist: true` (unknown DTO properties are stripped).
- `LoggerMiddleware` applied to `api/*` routes only.
- CORS allows `localhost:5173` and `localhost:3000` with credentials.

## Conventions

- **Commits use Conventional Commits** — enforced by commitlint via the `commit-msg` husky hook (`feat:`, `fix:`, `docs:`, `chore:`, …).
- Husky hooks: `pre-commit` → lint, `pre-push` → build, `commit-msg` → commitlint.
- ESLint runs type-checked rules (`recommendedTypeChecked`); `no-explicit-any` is off, `no-floating-promises` and `no-unsafe-argument` are warnings. Prettier is enforced as an ESLint error.
- File naming (from MODULE.README): `user.module.ts`, `user.controller.ts`, `user.entity.ts`, repo interface `*.repo.interface.ts`, repo impl `*.repo.ts`, responses `*.response.ts`.
- CI (`.github/workflows/backend_ci.yml`) on PRs/pushes to `develop` and `main`: install → `prisma generate` → lint → build. `main` is the PR base branch.
