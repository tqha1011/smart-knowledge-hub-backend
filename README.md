# Smart Knowledge Hub — Backend

A NestJS 11 backend for an AI-assisted internal knowledge base: knowledge spaces containing documents that are chunked and embedded for RAG-style chat, with per-workspace roles, per-document permissions, chat sessions, and unanswered-question tracking.

## Stack

- NestJS 11
- Prisma 7 + PostgreSQL (`pgvector`) via the `@prisma/adapter-pg` adapter
- BullMQ + Redis for the background document ingestion queue (chunking + embedding)
- Cloudflare R2 / S3-compatible storage for document files (`@aws-sdk/client-s3`)
- Gemini (`@google/genai`) for embeddings, Groq (`groq-sdk`) for chat answer generation
- `neverthrow` (`Result`) for error flow in the application/domain layers
- JWT guard + `@User()` decorator, `RolesGuard` keyed on `SystemRole`
- Global `ValidationPipe`, global exception filter, HTTP logger middleware on `api/*`
- Swagger UI at `/docs`
- ESLint + Prettier, Husky hooks, Commitlint enforcing conventional commits
- Multi-stage Dockerfile

## Setup

```bash
npm install
cp .env.example .env
npx prisma generate
```

You'll also need running instances of:

- PostgreSQL with the `pgvector` extension (used by `DocumentChunk.embedding`)
- Redis (BullMQ uses it for background document ingestion)

Update `.env`:

```env
DATABASE_URL='postgresql://user:password@localhost:5432/mydb'
DIRECT_URL=                          # falls back to DATABASE_URL if empty; used for migrations/CLI
JWT_SECRET='your_jwt_secret_key_here'
REDIS_URL='redis://localhost:6379'

S3_API_ENDPOINT=
S3_BUCKET_NAME=
S3_API_TOKEN=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_ACCOUNT_ID=

GROQ_API_KEY=
GEMINI_API_KEY=
```

`generated/prisma` is not committed (the client is generated there instead of `node_modules`). After cloning, or after any schema change, run:

```bash
npx prisma generate
```

## Running the app

```bash
npm run start:dev
```

The app runs by default at:

```txt
http://localhost:3000
```

Swagger:

```txt
http://localhost:3000/docs
```

## Scripts

```bash
npm run build
npm run lint
npm run format
npm run test
npm run test:e2e
```

Run a single test:

```bash
npm test -- path/to/file.spec.ts
npm test -- -t "describe or it name"
```

## Modules

Each feature lives under `src/modules/<feature>/`, split into four layers: `api/ → application/ → domain/ → infrastructure/` (controllers, services/dtos, entities/repo-interfaces/domain-errors, Prisma repos/mappers).

```txt
src/modules/
  auth/             login, JWT issuing
  user/             user accounts
  category/         document categories
  knowledge-space/  knowledge workspaces + membership roles (Owner/Editor/Viewer)
  document/         upload, permissions, processing status
  rag/              text chunking, embeddings (Gemini), answer generation (Groq)
  chat/             chat sessions, chat messages, unanswered-question tracking
```

`src/shared/` is strictly for cross-feature code (`shared/common`, `shared/domain`, `shared/infrastructure`).

## Git hooks

Husky is configured with:

```txt
pre-commit  -> npm run lint
pre-push    -> npm run build
commit-msg  -> commitlint
```

Commit messages follow conventional commits:

```txt
feat: add auth module
fix: update prisma service
docs: update module guide
chore: setup husky
```

## GitHub

The `.github` folder configures review ownership and CI for this repo.

```txt
.github/
  CODEOWNERS
  workflows/
    backend_ci.yml
```

`CODEOWNERS` declares the repo's default owners; GitHub uses it to suggest reviewers on pull requests.

The `Backend CI` workflow runs on push or pull request to `develop` and `main`.

Current CI steps:

```txt
checkout source code
setup Node.js 24
npm ci
npx prisma generate
npm run lint
npm run build
```

## Project layout

```txt
src/
  main.ts
  app.module.ts
  modules/
    auth/
    user/
    category/
    knowledge-space/
    document/
    rag/
    chat/
  shared/
    common/
      app-error.mapper.ts
      errorCode.ts
      exceptions.filter.ts
      jwt.guard.ts
      roles.guard.ts
      logger.middleware.ts
      user.decorator.ts
    domain/
      enum.ts
    infrastructure/
      database/
        prisma.module.ts
        prisma.service.ts
      queue/
      storage/
      parser/
prisma/
  schema.prisma       # generator + datasource only
  models/*.prisma      # one file per model, merged at generate time
```

New features go under `src/modules/<feature-name>`; new Prisma models go under `prisma/models/`.
