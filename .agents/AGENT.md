# AGENTS.MD

## Purpose

This file is the entrypoint for agents working in this backend repository.

When changing backend code, follow the existing style in `src/` first. This project prefers explicit Clean Architecture, functional error handling with `neverthrow`, small feature modules, and predictable NestJS dependency injection.

Do not generate generic NestJS code. Match the conventions already used in `auth`, `user`, `shared`, and `prisma/`.

## Instruction Priority

Follow instructions in this order:

1. Direct user request in the current conversation.
2. Existing code style and behavior in the closest related module.
3. `.agents/rules/*` and `.agents/skills/*`.
4. General framework or language best practices.

When instructions conflict, prefer the higher-priority source and mention the conflict briefly.

## Rule Loading

Load only the guidance needed for the current task:

- For backend code changes, read `.agents/rules/backend-architecture.md` and `.agents/rules/backend-code-style.md`.
- For multi-step work, read `.agents/rules/agent-workflow.md` and `.agents/skills/writing-plans.md`.
- For writing, reviewing, or refactoring code, read `.agents/skills/karpathy-guidelines.md`.
- For documentation-only edits, read only the specific file being edited and any directly referenced rule or skill.

## Rule Files

Read the relevant rule files before editing code:

- `.agents/rules/backend-architecture.md` for source layout, Clean Architecture boundaries, dependency injection, modules, and database access.
- `.agents/rules/backend-code-style.md` for naming, error handling, DTO validation, domain entities, repository behavior, and local commands.
- `.agents/rules/agent-workflow.md` for planning, implementation flow, verification, and things not to do.

## Backend Stack

- Framework: **NestJS**
- Language: **TypeScript**
- ORM: **Prisma**
- Database: **PostgreSQL**
- Auth: **JWT**
- Validation: **class-validator** + Nest `ValidationPipe`
- Error flow: **neverthrow**
- API docs: **Swagger**
- Deployment target: **Docker / Docker Compose**
