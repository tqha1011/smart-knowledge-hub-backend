# Smart Knowledge Hub — Backend

## Summary

Smart Knowledge Hub is a NestJS backend for an AI-assisted knowledge base. Teams organize documents in knowledge spaces and ask questions through a chat interface that retrieves relevant document content before generating answers.

## Core features

- **Knowledge spaces:** Create spaces, manage members, and assign Owner, Editor, or Viewer roles.
- **Documents:** Organize documents by category, manage document-level access, and upload or download files through signed URLs.
- **Document ingestion:** Extract text from uploaded PDF and DOCX files, split it into chunks, generate embeddings, and track processing status.
- **RAG chat:** Search accessible document chunks, generate answers with source references, and manage chat sessions and messages.
- **Unanswered questions:** Track questions without relevant content and resolve them into a workspace FAQ document for re-ingestion.
- **Accounts and notifications:** Support JWT authentication, refresh tokens, password recovery, email notifications, and real-time document status updates.

## Technical highlights

- **NestJS 11** with feature modules, global request validation, a normalized exception filter, and Swagger UI at `/docs`.
- **Prisma 7 + PostgreSQL/pgvector** for relational data and vector similarity search. The Prisma schema is split across `prisma/models/*.prisma`; the generated client lives in `generated/prisma/`.
- **BullMQ + Redis** for background ingestion, chat title generation, and email jobs. Socket.IO uses Redis for real-time notifications.
- **Cloudflare R2 or S3-compatible storage** for document files; **Gemini** creates embeddings and **Groq** generates chat answers.
- **Layered feature modules** (`api`, `application`, `domain`, `infrastructure`) with `neverthrow` results for application and domain error flow.

## Setup

```bash
npm install
cp .env.example .env
npx prisma generate
```

Start PostgreSQL with the `pgvector` extension and Redis, then configure `.env` with the database URLs, JWT secret, Redis URL, storage credentials, and Gemini and Groq API keys. See `.env.example` for all available settings. `DIRECT_URL` is used by Prisma migrations and falls back to `DATABASE_URL` when unset.

Run `npx prisma generate` after cloning or changing the Prisma schema because `generated/prisma/` is not committed.

## Run and verify

```bash
npm run start:dev   # API at http://localhost:3000; Swagger at /docs
npm run build
npm run lint
npm run test
npm run test:e2e
```

Run one unit test with `npm test -- path/to/file.spec.ts` or `npm test -- -t "test name"`.

## Modules and project architecture

Each feature under `src/modules/` follows the same layers: `api/` contains controllers, `application/` contains services and DTOs, `domain/` contains entities and repository contracts, and `infrastructure/` contains persistence and external-service implementations.

```txt
src/
  main.ts, app.module.ts
  modules/
    auth/             authentication and account recovery
    user/             user profiles
    knowledge-space/  spaces, types, members, and roles
    category/         document categories
    document/         files, access permissions, and processing state
    rag/              ingestion, embeddings, retrieval, and answer generation
    chat/             sessions, messages, and unanswered questions
  shared/
    common/           guards, decorators, errors, and HTTP middleware
    domain/           shared enums and types
    infrastructure/   Prisma, queues, storage, parsers, cache, notifications
prisma/
  schema.prisma       generator and datasource
  models/             feature models merged by Prisma
```

Feature-specific code belongs in its module; `src/shared/` holds cross-feature code. Prisma models use an internal integer `id` for relations and a UUID `publicId` for external APIs.
