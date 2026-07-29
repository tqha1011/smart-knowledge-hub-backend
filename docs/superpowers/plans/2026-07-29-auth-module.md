# Auth Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `POST /api/auth/register`, `POST /api/auth/login`, and `GET /api/auth/me` on top of a minimal `user` module, so any other module can rely on `JwtAuthGuard` + `@Roles()`.

**Architecture:** Two NestJS feature modules under `src/modules/`, each in the project's four-layer shape (`api` / `application` / `domain` / `infrastructure`). `user` owns the `UserEntity`, the `IUserRepo` port, and its Prisma adapter; it has no controller. `auth` owns the DTOs, `AuthService`, the `IPasswordHasher` port, its bcrypt adapter, and the controller. `auth` depends on `user`; never the reverse.

**Tech Stack:** NestJS 11, Prisma 7 (custom client at `generated/prisma/`), `@nestjs/jwt`, `bcrypt`, `class-validator` / `class-transformer`, Jest 30 + ts-jest.

Spec: `docs/superpowers/specs/2026-07-29-auth-module-design.md`.

## Deviations from the spec

Three things changed after verifying the toolchain. They are deliberate; implement the plan, not the spec, where they disagree.

1. **`EmailAlreadyExistsError` and `UserNotFoundError` live in `user/domain/errors/`, not `auth/domain/errors/`.** The spec puts all three errors in `auth`, but `UserPrismaRepo` has to raise "email already exists" when the unique index fires — which would make `user` import from `auth` and invert the dependency. Both errors are user-domain rules anyway. `auth/domain/errors/` keeps only `InvalidCredentialsError`.
2. **`expiresIn` is a number of seconds, not the string `'1d'`.** `@types/jsonwebtoken@9.0.10` types `SignOptions.expiresIn` as `StringValue | number`, so a plain `string` off `ConfigService` does not typecheck. Seconds need no cast and match the OAuth2 `expires_in` convention. `.env` gets `JWT_EXPIRES_IN=86400`.
3. **`package.json` gains a jest `moduleNameMapper`.** Verified: jest cannot currently resolve `generated/prisma/client` (`Cannot find module`), so any test touching Prisma types fails to run. Task 2 fixes it.

## Global Constraints

- Node imports of the Prisma client use the baseUrl form `generated/prisma/client` / `generated/prisma/enums`, matching `src/shared/infrastructure/database/prisma.service.ts`. All imports **within `src/`** are relative (`../../../shared/...`) — the existing code does this and it needs no extra jest or runtime config.
- Every model has an internal `id` (int) and a `publicId` (uuid). **Only `publicId` ever leaves the process.** The JWT subject is `publicId`.
- `SystemRole` (`shared/domain/enum.ts`: `admin` / `employee`) is what `RolesGuard` and `JwtPayload` use. Prisma's `Role` is `Admin` / `Employee`. Everything above `user/infrastructure/` speaks `SystemRole` only.
- Application and domain code throws `AppError` subclasses (`shared/common/errorCode.ts`). Controllers never `try/catch`; Task 1 makes the global filter translate them.
- File naming per `src/modules/MODULE.README.md`: `*.module.ts`, `*.controller.ts`, `*.entity.ts`, `*.repo.interface.ts`, `*.repo.ts`, `*.response.ts`. Tests are `*.spec.ts` next to the file they test.
- Conventional Commits (commitlint runs on `commit-msg`). `pre-commit` runs `npm run lint`, `pre-push` runs `npm run build`.
- No Prisma schema change, no migration.
- **The database is not reachable in this environment** (`DATABASE_URL` fails with Prisma `P1013`, invalid scheme). Every test in this plan is a unit test with mocks. Do not add tests that need a live database.

## File Structure

```
MODIFY  package.json                                            jest moduleNameMapper (Task 2)
MODIFY  src/app.module.ts                                       import AuthModule + UserModule (Task 7)
MODIFY  .env                                                    JWT_SECRET, JWT_EXPIRES_IN (Task 7)

MODIFY  src/shared/common/exceptions.filter.ts                  translate AppError (Task 1)
CREATE  src/shared/common/exceptions.filter.spec.ts             (Task 1)

CREATE  src/modules/user/domain/entities/user.entity.ts         shape of a user in memory (Task 2)
CREATE  src/modules/user/domain/errors/user.errors.ts           EmailAlreadyExists, UserNotFound (Task 2)
CREATE  src/modules/user/domain/repositories/user.repo.interface.ts   IUserRepo + USER_REPOSITORY (Task 2)
CREATE  src/modules/user/infrastructure/user.mapper.ts          Prisma row <-> entity, Role <-> SystemRole (Task 2)
CREATE  src/modules/user/infrastructure/user.mapper.spec.ts     (Task 2)
CREATE  src/modules/user/infrastructure/user.repo.ts            UserPrismaRepo (Task 3)
CREATE  src/modules/user/infrastructure/user.repo.spec.ts       (Task 3)
CREATE  src/modules/user/user.module.ts                         binds + exports USER_REPOSITORY (Task 3)

CREATE  src/modules/auth/domain/errors/auth.errors.ts           InvalidCredentialsError (Task 4)
CREATE  src/modules/auth/application/interfaces/password-hasher.interface.ts   port (Task 4)
CREATE  src/modules/auth/infrastructure/bcrypt.hasher.ts        adapter (Task 4)
CREATE  src/modules/auth/infrastructure/bcrypt.hasher.spec.ts   (Task 4)
CREATE  src/modules/auth/application/dtos/register.dto.ts       (Task 5)
CREATE  src/modules/auth/application/dtos/login.dto.ts          (Task 5)
CREATE  src/modules/auth/application/dtos/user.response.ts      (Task 5)
CREATE  src/modules/auth/application/dtos/auth.response.ts      (Task 5)
CREATE  src/modules/auth/application/dtos/auth.dto.spec.ts      (Task 5)
CREATE  src/modules/auth/application/services/auth.service.ts   (Task 6)
CREATE  src/modules/auth/application/services/auth.service.spec.ts    (Task 6)
CREATE  src/modules/auth/api/auth.controller.ts                 (Task 7)
CREATE  src/modules/auth/api/auth.controller.spec.ts            (Task 7)
CREATE  src/modules/auth/auth.module.ts                         (Task 7)
```

---

### Task 1: Translate `AppError` into an HTTP response

`toHttpException()` already exists in `src/shared/common/app-error.mapper.ts` but nothing calls it. Today an `AppError` thrown from a service reaches `AllExceptionsFilter`, fails the `instanceof HttpException` check, and becomes a `500` with the message replaced by `'Internal Server Error'`. Every later task depends on this being fixed.

**Files:**

- Modify: `src/shared/common/exceptions.filter.ts`
- Test: `src/shared/common/exceptions.filter.spec.ts` (create)

**Interfaces:**

- Consumes: `AppError`, `ErrorCode` from `./errorCode`; `toHttpException` from `./app-error.mapper` (both already exist).
- Produces: nothing importable. The guarantee later tasks rely on: **throwing an `AppError` subclass from anywhere produces the status its `ErrorCode` implies, with the error's own message.**

- [ ] **Step 1: Write the failing test**

Create `src/shared/common/exceptions.filter.spec.ts`:

```ts
import {
  ArgumentsHost,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppError, ErrorCode } from './errorCode';
import { AllExceptionsFilter } from './exceptions.filter';

function createHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/api/auth/register' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    // The filter logs every exception it handles; silence it so a passing
    // run does not print stack traces.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter = new AllExceptionsFilter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gives an AppError the status its ErrorCode implies', () => {
    const { host, status, json } = createHost();

    filter.catch(
      new AppError(ErrorCode.Conflict, 'Email is already registered'),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        message: 'Email is already registered',
        path: '/api/auth/register',
      }),
    );
  });

  it('maps an Unauthorized AppError to 401', () => {
    const { host, status } = createHost();

    filter.catch(
      new AppError(ErrorCode.Unauthorized, 'Email or password is incorrect'),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
  });

  it('leaves a plain HttpException alone', () => {
    const { host, status, json } = createHost();

    filter.catch(new NotFoundException('User not found'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'User not found' }),
    );
  });

  it('reports an unrecognised error as 500 without leaking its message', () => {
    const { host, status, json } = createHost();

    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal Server Error' }),
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm the AppError cases fail**

Run: `npm test -- src/shared/common/exceptions.filter.spec.ts`

Expected: the two `AppError` tests FAIL (status called with `500`, not `409` / `401`); the `HttpException` and unknown-error tests already PASS.

- [ ] **Step 3: Translate `AppError` at the top of `catch()`**

In `src/shared/common/exceptions.filter.ts`, add the two imports and derive an `error` local. Keep the logging block reading the **original** `exception` so the real stack is still logged.

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { toHttpException } from './app-error.mapper';
import { AppError } from './errorCode';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Domain and application code throws AppError. Translating it here is
    // what lets controllers stay free of try/catch.
    const error =
      exception instanceof AppError ? toHttpException(exception) : exception;

    const status =
      error instanceof HttpException
        ? error.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof Error) {
      this.logger.error(
        `[${request.method}] ${request.url} - Status: ${status} - Lỗi: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `[${request.method}] ${request.url} - Lỗi không xác định`,
        exception,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        error instanceof HttpException
          ? error.message
          : 'Internal Server Error',
    });
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- src/shared/common/exceptions.filter.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/common/exceptions.filter.ts src/shared/common/exceptions.filter.spec.ts
git commit -m "fix: map AppError to its HTTP status in the global exception filter"
```

---

### Task 2: User domain types and the Prisma mapper

Defines what a user looks like in memory, the port the repository implements, and the translation between Prisma rows and that shape. Also fixes jest so tests can import the generated Prisma client at all.

**Files:**

- Modify: `package.json` (the `jest` block)
- Create: `src/modules/user/domain/entities/user.entity.ts`
- Create: `src/modules/user/domain/errors/user.errors.ts`
- Create: `src/modules/user/domain/repositories/user.repo.interface.ts`
- Create: `src/modules/user/infrastructure/user.mapper.ts`
- Test: `src/modules/user/infrastructure/user.mapper.spec.ts`

**Interfaces:**

- Consumes: `SystemRole` from `src/shared/domain/enum.ts`; `AppError`, `ErrorCode` from `src/shared/common/errorCode.ts`; `User` and `Role` from the generated Prisma client.
- Produces, relied on by Tasks 3, 5, 6, 7:
  - `interface UserEntity { id: number; publicId: string; username: string; email: string; password: string; role: SystemRole; createdAt: Date; updatedAt: Date }`
  - `class EmailAlreadyExistsError extends AppError` — no constructor arguments
  - `class UserNotFoundError extends AppError` — no constructor arguments
  - `interface CreateUserInput { username: string; email: string; password: string; role: SystemRole }`
  - `interface IUserRepo { findByEmail(email: string): Promise<UserEntity | null>; findByPublicId(publicId: string): Promise<UserEntity | null>; create(input: CreateUserInput): Promise<UserEntity> }`
  - `const USER_REPOSITORY: symbol`
  - `toSystemRole(role: Role): SystemRole`, `toPrismaRole(role: SystemRole): Role`, `toUserEntity(row: PrismaUser): UserEntity`

- [ ] **Step 1: Let jest resolve the generated Prisma client**

Jest's `rootDir` is `src`, and nothing teaches it the tsconfig `baseUrl`, so `import ... from 'generated/prisma/client'` fails with `Cannot find module`. The generated files also import each other with nodenext-style `./enums.js` specifiers that point at `.ts` files, which jest will not resolve either. Both are handled by `moduleNameMapper`.

In `package.json`, add this key inside the `"jest"` object as the **first** entry, immediately before `"moduleFileExtensions"` (watch the JSON commas — the block must stay valid JSON):

```json
    "moduleNameMapper": {
      "^generated/(.*)$": "<rootDir>/../generated/$1",
      "^(\\.{1,2}/.*)\\.js$": "$1"
    },
```

The second rule strips the `.js` suffix from relative imports. Nothing under `src/` writes extensions on relative imports, so it only affects the generated client.

- [ ] **Step 2: Write the failing test**

Create `src/modules/user/infrastructure/user.mapper.spec.ts`:

```ts
import type { User as PrismaUser } from 'generated/prisma/client';
import { Role } from 'generated/prisma/enums';
import { SystemRole } from '../../../shared/domain/enum';
import { toPrismaRole, toSystemRole, toUserEntity } from './user.mapper';

const row: PrismaUser = {
  id: 1,
  publicId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
  username: 'quangha',
  email: 'quangha@example.com',
  password: '$2b$10$storedhashstoredhashsto',
  role: Role.Employee,
  createdAt: new Date('2026-07-29T00:00:00.000Z'),
  updatedAt: new Date('2026-07-29T00:00:00.000Z'),
};

describe('user mapper', () => {
  it('translates the Prisma Role spelling to SystemRole', () => {
    expect(toSystemRole(Role.Admin)).toBe(SystemRole.Admin);
    expect(toSystemRole(Role.Employee)).toBe(SystemRole.Employee);
  });

  it('translates SystemRole back to the Prisma Role spelling', () => {
    expect(toPrismaRole(SystemRole.Admin)).toBe(Role.Admin);
    expect(toPrismaRole(SystemRole.Employee)).toBe(Role.Employee);
  });

  it('carries every column onto the entity', () => {
    expect(toUserEntity(row)).toEqual({
      id: 1,
      publicId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
      username: 'quangha',
      email: 'quangha@example.com',
      password: '$2b$10$storedhashstoredhashsto',
      role: SystemRole.Employee,
      createdAt: new Date('2026-07-29T00:00:00.000Z'),
      updatedAt: new Date('2026-07-29T00:00:00.000Z'),
    });
  });

  it('maps an Admin row onto the admin SystemRole', () => {
    expect(toUserEntity({ ...row, role: Role.Admin }).role).toBe(
      SystemRole.Admin,
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/modules/user/infrastructure/user.mapper.spec.ts`
Expected: FAIL — `Cannot find module './user.mapper'`. (If it instead fails with `Cannot find module 'generated/prisma/client'`, Step 1 was not applied.)

- [ ] **Step 4: Write the entity**

Create `src/modules/user/domain/entities/user.entity.ts`:

```ts
import { SystemRole } from '../../../../shared/domain/enum';

/**
 * A user as the rest of the app sees it. `id` stays internal (foreign keys,
 * joins); `publicId` is the only identifier that may leave the process.
 */
export interface UserEntity {
  id: number;
  publicId: string;
  username: string;
  email: string;
  /** bcrypt hash — never copy this into a response. */
  password: string;
  role: SystemRole;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 5: Write the domain errors**

Create `src/modules/user/domain/errors/user.errors.ts`:

```ts
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';

export class EmailAlreadyExistsError extends AppError {
  constructor() {
    super(ErrorCode.Conflict, 'Email is already registered');
  }
}

export class UserNotFoundError extends AppError {
  constructor() {
    super(ErrorCode.NotFound, 'User not found');
  }
}
```

- [ ] **Step 6: Write the repository port**

Create `src/modules/user/domain/repositories/user.repo.interface.ts`:

```ts
import { SystemRole } from '../../../../shared/domain/enum';
import { UserEntity } from '../entities/user.entity';

export interface CreateUserInput {
  username: string;
  email: string;
  /** Already hashed. The repository never sees a plaintext password. */
  password: string;
  role: SystemRole;
}

export interface IUserRepo {
  findByEmail(email: string): Promise<UserEntity | null>;
  findByPublicId(publicId: string): Promise<UserEntity | null>;
  create(input: CreateUserInput): Promise<UserEntity>;
}

/** DI token: `IUserRepo` is an interface and does not survive compilation. */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
```

- [ ] **Step 7: Write the mapper**

Create `src/modules/user/infrastructure/user.mapper.ts`:

```ts
import type { User as PrismaUser } from 'generated/prisma/client';
import { Role } from 'generated/prisma/enums';
import { SystemRole } from '../../../shared/domain/enum';
import { UserEntity } from '../domain/entities/user.entity';

/**
 * Prisma spells the roles `Admin` / `Employee`; `SystemRole` — what
 * `RolesGuard` and the JWT payload use — spells them `admin` / `employee`.
 * This file is the only place the two spellings meet.
 */
export function toSystemRole(role: Role): SystemRole {
  return role === Role.Admin ? SystemRole.Admin : SystemRole.Employee;
}

export function toPrismaRole(role: SystemRole): Role {
  return role === SystemRole.Admin ? Role.Admin : Role.Employee;
}

export function toUserEntity(row: PrismaUser): UserEntity {
  return {
    id: row.id,
    publicId: row.publicId,
    username: row.username,
    email: row.email,
    password: row.password,
    role: toSystemRole(row.role),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- src/modules/user/infrastructure/user.mapper.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Confirm the jest change broke nothing else**

Run: `npm test`
Expected: PASS — Task 1's filter suite plus this one.

- [ ] **Step 10: Commit**

```bash
git add package.json src/modules/user
git commit -m "feat: add user entity, repository port and prisma mapper"
```

---

### Task 3: `UserPrismaRepo` and `UserModule`

The Prisma adapter behind `IUserRepo`, plus the module that binds the token so `auth` can inject it.

**Files:**

- Create: `src/modules/user/infrastructure/user.repo.ts`
- Create: `src/modules/user/user.module.ts`
- Test: `src/modules/user/infrastructure/user.repo.spec.ts`

**Interfaces:**

- Consumes: `UserEntity`, `EmailAlreadyExistsError`, `CreateUserInput`, `IUserRepo`, `USER_REPOSITORY`, `toPrismaRole`, `toUserEntity` (Task 2); `PrismaService` from `src/shared/infrastructure/database/prisma.service.ts`.
- Produces: `class UserPrismaRepo implements IUserRepo` with constructor `(prisma: PrismaService)`; `class UserModule` exporting the `USER_REPOSITORY` provider. Task 7's `AuthModule` imports `UserModule`.

Note: `PrismaModule` is `@Global()`, so `UserModule` injects `PrismaService` without importing anything.

- [ ] **Step 1: Write the failing test**

Create `src/modules/user/infrastructure/user.repo.spec.ts`:

```ts
import { Prisma } from 'generated/prisma/client';
import { Role } from 'generated/prisma/enums';
import { SystemRole } from '../../../shared/domain/enum';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { EmailAlreadyExistsError } from '../domain/errors/user.errors';
import { UserPrismaRepo } from './user.repo';

const row = {
  id: 1,
  publicId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
  username: 'quangha',
  email: 'quangha@example.com',
  password: '$2b$10$storedhashstoredhashsto',
  role: Role.Employee,
  createdAt: new Date('2026-07-29T00:00:00.000Z'),
  updatedAt: new Date('2026-07-29T00:00:00.000Z'),
};

const newUser = {
  username: 'quangha',
  email: 'quangha@example.com',
  password: '$2b$10$storedhashstoredhashsto',
  role: SystemRole.Employee,
};

describe('UserPrismaRepo', () => {
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let repo: UserPrismaRepo;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    repo = new UserPrismaRepo(prisma as unknown as PrismaService);
  });

  it('returns null when no user holds that email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(repo.findByEmail('nobody@example.com')).resolves.toBeNull();
  });

  it('queries by email and returns a mapped entity', async () => {
    prisma.user.findUnique.mockResolvedValue(row);

    const user = await repo.findByEmail('quangha@example.com');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'quangha@example.com' },
    });
    expect(user?.publicId).toBe(row.publicId);
    expect(user?.role).toBe(SystemRole.Employee);
  });

  it('queries by publicId, not by the numeric id', async () => {
    prisma.user.findUnique.mockResolvedValue(row);

    await repo.findByPublicId(row.publicId);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { publicId: row.publicId },
    });
  });

  it('writes the Prisma Role spelling when creating', async () => {
    prisma.user.create.mockResolvedValue({ ...row, role: Role.Admin });

    const user = await repo.create({ ...newUser, role: SystemRole.Admin });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        username: 'quangha',
        email: 'quangha@example.com',
        password: '$2b$10$storedhashstoredhashsto',
        role: Role.Admin,
      },
    });
    expect(user.role).toBe(SystemRole.Admin);
  });

  it('turns a P2002 unique violation into EmailAlreadyExistsError', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        { code: 'P2002', clientVersion: '7.8.0' },
      ),
    );

    await expect(repo.create(newUser)).rejects.toBeInstanceOf(
      EmailAlreadyExistsError,
    );
  });

  it('rethrows database errors it does not recognise', async () => {
    prisma.user.create.mockRejectedValue(new Error('connection terminated'));

    await expect(repo.create(newUser)).rejects.toThrow('connection terminated');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/modules/user/infrastructure/user.repo.spec.ts`
Expected: FAIL — `Cannot find module './user.repo'`.

- [ ] **Step 3: Write the repository**

Create `src/modules/user/infrastructure/user.repo.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { UserEntity } from '../domain/entities/user.entity';
import { EmailAlreadyExistsError } from '../domain/errors/user.errors';
import {
  CreateUserInput,
  IUserRepo,
} from '../domain/repositories/user.repo.interface';
import { toPrismaRole, toUserEntity } from './user.mapper';

@Injectable()
export class UserPrismaRepo implements IUserRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? toUserEntity(row) : null;
  }

  async findByPublicId(publicId: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { publicId } });
    return row ? toUserEntity(row) : null;
  }

  async create(input: CreateUserInput): Promise<UserEntity> {
    try {
      const row = await this.prisma.user.create({
        data: {
          username: input.username,
          email: input.email,
          password: input.password,
          role: toPrismaRole(input.role),
        },
      });
      return toUserEntity(row);
    } catch (error) {
      // Two concurrent registrations can both pass the caller's email check.
      // The unique index is what actually decides which one wins.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new EmailAlreadyExistsError();
      }
      throw error;
    }
  }
}
```

- [ ] **Step 4: Write the module**

Create `src/modules/user/user.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './domain/repositories/user.repo.interface';
import { UserPrismaRepo } from './infrastructure/user.repo';

@Module({
  providers: [{ provide: USER_REPOSITORY, useClass: UserPrismaRepo }],
  exports: [USER_REPOSITORY],
})
export class UserModule {}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/modules/user/infrastructure/user.repo.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/user
git commit -m "feat: add prisma user repository and user module"
```

---

### Task 4: Password hasher port and adapter, plus the auth domain error

**Files:**

- Create: `src/modules/auth/application/interfaces/password-hasher.interface.ts`
- Create: `src/modules/auth/infrastructure/bcrypt.hasher.ts`
- Create: `src/modules/auth/domain/errors/auth.errors.ts`
- Test: `src/modules/auth/infrastructure/bcrypt.hasher.spec.ts`

**Interfaces:**

- Consumes: `AppError`, `ErrorCode` from `src/shared/common/errorCode.ts`; the `bcrypt` package (already a dependency, `@types/bcrypt` installed).
- Produces, relied on by Tasks 6 and 7:
  - `interface IPasswordHasher { hash(plain: string): Promise<string>; compare(plain: string, hash: string): Promise<boolean> }`
  - `const PASSWORD_HASHER: symbol`
  - `class BcryptPasswordHasher implements IPasswordHasher` — no constructor arguments
  - `class InvalidCredentialsError extends AppError` — no constructor arguments

- [ ] **Step 1: Write the failing test**

Create `src/modules/auth/infrastructure/bcrypt.hasher.spec.ts`:

```ts
import { BcryptPasswordHasher } from './bcrypt.hasher';

// bcrypt is deliberately slow: 10 rounds costs roughly 100ms per call, and
// this suite makes several.
jest.setTimeout(20000);

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher();
  const plain = 'correct horse battery';

  it('produces a bcrypt hash that does not contain the plaintext', async () => {
    const hash = await hasher.hash(plain);

    expect(hash).not.toContain(plain);
    expect(hash.startsWith('$2b$')).toBe(true);
  });

  it('accepts the password it hashed', async () => {
    const hash = await hasher.hash(plain);

    await expect(hasher.compare(plain, hash)).resolves.toBe(true);
  });

  it('rejects a password that differs only in case', async () => {
    const hash = await hasher.hash(plain);

    await expect(hasher.compare('Correct horse battery', hash)).resolves.toBe(
      false,
    );
  });

  it('salts, so the same password hashes differently each time', async () => {
    const [first, second] = await Promise.all([
      hasher.hash(plain),
      hasher.hash(plain),
    ]);

    expect(first).not.toBe(second);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/modules/auth/infrastructure/bcrypt.hasher.spec.ts`
Expected: FAIL — `Cannot find module './bcrypt.hasher'`.

- [ ] **Step 3: Write the port**

Create `src/modules/auth/application/interfaces/password-hasher.interface.ts`:

```ts
export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}

/** DI token: `IPasswordHasher` is an interface and does not survive compilation. */
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
```

- [ ] **Step 4: Write the bcrypt adapter**

Create `src/modules/auth/infrastructure/bcrypt.hasher.ts`:

```ts
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { IPasswordHasher } from '../application/interfaces/password-hasher.interface';

const SALT_ROUNDS = 10;

@Injectable()
export class BcryptPasswordHasher implements IPasswordHasher {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
```

- [ ] **Step 5: Write the auth domain error**

Create `src/modules/auth/domain/errors/auth.errors.ts`:

```ts
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';

/**
 * Raised both for an unknown email and for a wrong password, deliberately
 * with the same message, so the endpoint never reveals which emails exist.
 */
export class InvalidCredentialsError extends AppError {
  constructor() {
    super(ErrorCode.Unauthorized, 'Email or password is incorrect');
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/modules/auth/infrastructure/bcrypt.hasher.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add src/modules/auth
git commit -m "feat: add password hasher port, bcrypt adapter and auth errors"
```

---

### Task 5: Request DTOs and response shapes

**Files:**

- Create: `src/modules/auth/application/dtos/register.dto.ts`
- Create: `src/modules/auth/application/dtos/login.dto.ts`
- Create: `src/modules/auth/application/dtos/user.response.ts`
- Create: `src/modules/auth/application/dtos/auth.response.ts`
- Test: `src/modules/auth/application/dtos/auth.dto.spec.ts`

**Interfaces:**

- Consumes: `UserEntity` (Task 2); `SystemRole` from `src/shared/domain/enum.ts`.
- Produces, relied on by Tasks 6 and 7:
  - `class RegisterDto { username: string; email: string; password: string }`
  - `class LoginDto { email: string; password: string }`
  - `class UserResponse { publicId: string; username: string; email: string; role: SystemRole }` with `static fromEntity(user: UserEntity): UserResponse`
  - `class AuthResponse { accessToken: string; expiresIn: number; user: UserResponse }` — `expiresIn` is **seconds**

The global `ValidationPipe` already runs with `whitelist: true`, so unknown body properties are stripped before a DTO reaches the controller.

- [ ] **Step 1: Write the failing test**

Create `src/modules/auth/application/dtos/auth.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SystemRole } from '../../../../shared/domain/enum';
import { UserEntity } from '../../../user/domain/entities/user.entity';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';
import { UserResponse } from './user.response';

async function invalidFields<T extends object>(
  cls: new () => T,
  payload: object,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, payload));
  return errors.map((error) => error.property);
}

const validRegistration = {
  username: 'quangha',
  email: 'quangha@example.com',
  password: 'sup3rsecret',
};

describe('RegisterDto', () => {
  it('accepts a well formed body', async () => {
    await expect(
      invalidFields(RegisterDto, validRegistration),
    ).resolves.toEqual([]);
  });

  it('rejects a malformed email', async () => {
    await expect(
      invalidFields(RegisterDto, { ...validRegistration, email: 'nope' }),
    ).resolves.toContain('email');
  });

  it('rejects a password shorter than 8 characters', async () => {
    await expect(
      invalidFields(RegisterDto, { ...validRegistration, password: 'short7c' }),
    ).resolves.toContain('password');
  });

  it('rejects a username shorter than 3 characters', async () => {
    await expect(
      invalidFields(RegisterDto, { ...validRegistration, username: 'ha' }),
    ).resolves.toContain('username');
  });
});

describe('LoginDto', () => {
  it('accepts a well formed body', async () => {
    await expect(
      invalidFields(LoginDto, {
        email: 'quangha@example.com',
        password: 'sup3rsecret',
      }),
    ).resolves.toEqual([]);
  });

  it('rejects an empty password', async () => {
    await expect(
      invalidFields(LoginDto, {
        email: 'quangha@example.com',
        password: '',
      }),
    ).resolves.toContain('password');
  });
});

describe('UserResponse.fromEntity', () => {
  const entity: UserEntity = {
    id: 1,
    publicId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
    username: 'quangha',
    email: 'quangha@example.com',
    password: '$2b$10$storedhashstoredhashsto',
    role: SystemRole.Employee,
    createdAt: new Date('2026-07-29T00:00:00.000Z'),
    updatedAt: new Date('2026-07-29T00:00:00.000Z'),
  };

  it('exposes only the public fields', () => {
    expect(UserResponse.fromEntity(entity)).toEqual({
      publicId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
      username: 'quangha',
      email: 'quangha@example.com',
      role: SystemRole.Employee,
    });
  });

  it('drops the internal id and the password hash', () => {
    const response = UserResponse.fromEntity(entity);

    expect(response).not.toHaveProperty('id');
    expect(response).not.toHaveProperty('password');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/modules/auth/application/dtos/auth.dto.spec.ts`
Expected: FAIL — `Cannot find module './login.dto'`.

- [ ] **Step 3: Write `RegisterDto`**

Create `src/modules/auth/application/dtos/register.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'quangha', minLength: 3, maxLength: 50 })
  @IsString()
  @Length(3, 50)
  username: string;

  @ApiProperty({ example: 'quangha@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'sup3rsecret', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
```

- [ ] **Step 4: Write `LoginDto`**

Create `src/modules/auth/application/dtos/login.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'quangha@example.com' })
  @IsEmail()
  email: string;

  // No length rule here: the stored password may predate any rule change,
  // and a length hint on login only helps someone guessing.
  @ApiProperty({ example: 'sup3rsecret' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
```

- [ ] **Step 5: Write `UserResponse`**

Create `src/modules/auth/application/dtos/user.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { SystemRole } from '../../../../shared/domain/enum';
import { UserEntity } from '../../../user/domain/entities/user.entity';

export class UserResponse {
  @ApiProperty({ example: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0' })
  publicId: string;

  @ApiProperty({ example: 'quangha' })
  username: string;

  @ApiProperty({ example: 'quangha@example.com' })
  email: string;

  @ApiProperty({ enum: SystemRole, example: SystemRole.Employee })
  role: SystemRole;

  /** Deliberately drops the internal `id` and the password hash. */
  static fromEntity(user: UserEntity): UserResponse {
    return {
      publicId: user.publicId,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }
}
```

- [ ] **Step 6: Write `AuthResponse`**

Create `src/modules/auth/application/dtos/auth.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { UserResponse } from './user.response';

export class AuthResponse {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({
    example: 86400,
    description: 'Access token lifetime, in seconds',
  })
  expiresIn: number;

  @ApiProperty({ type: UserResponse })
  user: UserResponse;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- src/modules/auth/application/dtos/auth.dto.spec.ts`
Expected: PASS, 8 tests.

- [ ] **Step 8: Commit**

```bash
git add src/modules/auth/application/dtos
git commit -m "feat: add auth request dtos and response shapes"
```

---

### Task 6: `AuthService`

The whole of the register / login / me behaviour, with every dependency behind an interface so the suite runs without bcrypt, a database, or a real signing key.

**Files:**

- Create: `src/modules/auth/application/services/auth.service.ts`
- Test: `src/modules/auth/application/services/auth.service.spec.ts`

**Interfaces:**

- Consumes: `IUserRepo` + `USER_REPOSITORY`, `UserEntity`, `EmailAlreadyExistsError`, `UserNotFoundError` (Task 2); `IPasswordHasher` + `PASSWORD_HASHER`, `InvalidCredentialsError` (Task 4); `RegisterDto`, `LoginDto`, `AuthResponse`, `UserResponse` (Task 5); `JwtPayload` from `src/shared/common/jwt.payload.interface.ts`; `JwtService`, `ConfigService`.
- Produces, relied on by Task 7: `class AuthService` with constructor `(userRepo, hasher, jwtService, config)` in that order, and methods `register(dto: RegisterDto): Promise<AuthResponse>`, `login(dto: LoginDto): Promise<AuthResponse>`, `me(publicId: string): Promise<UserResponse>`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/auth/application/services/auth.service.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SystemRole } from '../../../../shared/domain/enum';
import { UserEntity } from '../../../user/domain/entities/user.entity';
import {
  EmailAlreadyExistsError,
  UserNotFoundError,
} from '../../../user/domain/errors/user.errors';
import { IUserRepo } from '../../../user/domain/repositories/user.repo.interface';
import { InvalidCredentialsError } from '../../domain/errors/auth.errors';
import { RegisterDto } from '../dtos/register.dto';
import { IPasswordHasher } from '../interfaces/password-hasher.interface';
import { AuthService } from './auth.service';

const storedUser: UserEntity = {
  id: 1,
  publicId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
  username: 'quangha',
  email: 'quangha@example.com',
  password: '$2b$10$storedhashstoredhashsto',
  role: SystemRole.Employee,
  createdAt: new Date('2026-07-29T00:00:00.000Z'),
  updatedAt: new Date('2026-07-29T00:00:00.000Z'),
};

const registration = {
  username: 'quangha',
  email: 'quangha@example.com',
  password: 'sup3rsecret',
};

const credentials = {
  email: 'quangha@example.com',
  password: 'sup3rsecret',
};

describe('AuthService', () => {
  let userRepo: jest.Mocked<IUserRepo>;
  let hasher: jest.Mocked<IPasswordHasher>;
  let jwtService: { signAsync: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    userRepo = {
      findByEmail: jest.fn(),
      findByPublicId: jest.fn(),
      create: jest.fn(),
    };
    hasher = { hash: jest.fn(), compare: jest.fn() };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    const config = { getOrThrow: jest.fn().mockReturnValue('86400') };

    service = new AuthService(
      userRepo,
      hasher,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  describe('register', () => {
    beforeEach(() => {
      userRepo.findByEmail.mockResolvedValue(null);
      hasher.hash.mockResolvedValue('$2b$10$freshhashfreshhashfres');
      userRepo.create.mockResolvedValue({
        ...storedUser,
        password: '$2b$10$freshhashfreshhashfres',
      });
    });

    it('stores the hashed password, never the plaintext', async () => {
      await service.register(registration);

      expect(hasher.hash).toHaveBeenCalledWith('sup3rsecret');
      expect(userRepo.create).toHaveBeenCalledWith({
        username: 'quangha',
        email: 'quangha@example.com',
        password: '$2b$10$freshhashfreshhashfres',
        role: SystemRole.Employee,
      });
    });

    it('always registers an Employee, even if the body asks otherwise', async () => {
      // `whitelist: true` normally strips this, but the service must not rely
      // on the pipe for a privilege decision.
      await service.register({
        ...registration,
        role: SystemRole.Admin,
      } as unknown as RegisterDto);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: SystemRole.Employee }),
      );
    });

    it('returns a token, its lifetime in seconds, and the public profile', async () => {
      const result = await service.register(registration);

      expect(result).toEqual({
        accessToken: 'signed.jwt.token',
        expiresIn: 86400,
        user: {
          publicId: storedUser.publicId,
          username: 'quangha',
          email: 'quangha@example.com',
          role: SystemRole.Employee,
        },
      });
    });

    it('signs the token with publicId as the subject, not the numeric id', async () => {
      await service.register(registration);

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: storedUser.publicId,
        email: 'quangha@example.com',
        role: SystemRole.Employee,
      });
    });

    it('rejects a taken email without paying for bcrypt', async () => {
      userRepo.findByEmail.mockResolvedValue(storedUser);

      await expect(service.register(registration)).rejects.toBeInstanceOf(
        EmailAlreadyExistsError,
      );
      expect(hasher.hash).not.toHaveBeenCalled();
      expect(userRepo.create).not.toHaveBeenCalled();
    });

    it('propagates the conflict the unique index raises on a race', async () => {
      userRepo.create.mockRejectedValue(new EmailAlreadyExistsError());

      await expect(service.register(registration)).rejects.toBeInstanceOf(
        EmailAlreadyExistsError,
      );
    });
  });

  describe('login', () => {
    it('returns a token when the password matches', async () => {
      userRepo.findByEmail.mockResolvedValue(storedUser);
      hasher.compare.mockResolvedValue(true);

      const result = await service.login(credentials);

      expect(hasher.compare).toHaveBeenCalledWith(
        'sup3rsecret',
        storedUser.password,
      );
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.expiresIn).toBe(86400);
    });

    it('rejects an unknown email without running a comparison', async () => {
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(service.login(credentials)).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
      expect(hasher.compare).not.toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      userRepo.findByEmail.mockResolvedValue(storedUser);
      hasher.compare.mockResolvedValue(false);

      await expect(service.login(credentials)).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    });

    it('says the same thing for an unknown email and a wrong password', async () => {
      // Any difference between these two answers tells an attacker which
      // emails are registered.
      userRepo.findByEmail.mockResolvedValue(null);
      await expect(service.login(credentials)).rejects.toThrow(
        'Email or password is incorrect',
      );

      userRepo.findByEmail.mockResolvedValue(storedUser);
      hasher.compare.mockResolvedValue(false);
      await expect(service.login(credentials)).rejects.toThrow(
        'Email or password is incorrect',
      );
    });
  });

  describe('me', () => {
    it('reads the user fresh instead of trusting the token', async () => {
      userRepo.findByPublicId.mockResolvedValue({
        ...storedUser,
        role: SystemRole.Admin,
      });

      const result = await service.me(storedUser.publicId);

      expect(userRepo.findByPublicId).toHaveBeenCalledWith(storedUser.publicId);
      // The token said Employee; the database says Admin and wins.
      expect(result.role).toBe(SystemRole.Admin);
    });

    it('raises UserNotFoundError when the account is gone', async () => {
      userRepo.findByPublicId.mockResolvedValue(null);

      await expect(service.me(storedUser.publicId)).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
    });

    it('never returns the password hash', async () => {
      userRepo.findByPublicId.mockResolvedValue(storedUser);

      const result = await service.me(storedUser.publicId);

      expect(result).not.toHaveProperty('password');
      expect(JSON.stringify(result)).not.toContain(storedUser.password);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/modules/auth/application/services/auth.service.spec.ts`
Expected: FAIL — `Cannot find module './auth.service'`.

- [ ] **Step 3: Write the service**

Create `src/modules/auth/application/services/auth.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UUID } from 'crypto';
import { JwtPayload } from '../../../../shared/common/jwt.payload.interface';
import { SystemRole } from '../../../../shared/domain/enum';
import { UserEntity } from '../../../user/domain/entities/user.entity';
import {
  EmailAlreadyExistsError,
  UserNotFoundError,
} from '../../../user/domain/errors/user.errors';
import {
  IUserRepo,
  USER_REPOSITORY,
} from '../../../user/domain/repositories/user.repo.interface';
import { InvalidCredentialsError } from '../../domain/errors/auth.errors';
import { AuthResponse } from '../dtos/auth.response';
import { LoginDto } from '../dtos/login.dto';
import { RegisterDto } from '../dtos/register.dto';
import { UserResponse } from '../dtos/user.response';
import {
  IPasswordHasher,
  PASSWORD_HASHER,
} from '../interfaces/password-hasher.interface';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepo,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.userRepo.findByEmail(dto.email);
    if (existing) {
      throw new EmailAlreadyExistsError();
    }

    // Hash only once the email is known to be free: bcrypt costs ~100ms and
    // a taken email was never going to be written anyway. The repository
    // still raises the same error if the unique index catches a race.
    const password = await this.hasher.hash(dto.password);
    const user = await this.userRepo.create({
      username: dto.username,
      email: dto.email,
      password,
      // Self-registration never grants Admin.
      role: SystemRole.Employee,
    });

    return this.issueToken(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const matches = await this.hasher.compare(dto.password, user.password);
    if (!matches) {
      throw new InvalidCredentialsError();
    }

    return this.issueToken(user);
  }

  async me(publicId: string): Promise<UserResponse> {
    // Read fresh rather than echoing the token, so a role changed after the
    // token was issued takes effect immediately.
    const user = await this.userRepo.findByPublicId(publicId);
    if (!user) {
      throw new UserNotFoundError();
    }

    return UserResponse.fromEntity(user);
  }

  private async issueToken(user: UserEntity): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.publicId as UUID,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      expiresIn: Number(this.config.getOrThrow<string>('JWT_EXPIRES_IN')),
      user: UserResponse.fromEntity(user),
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/modules/auth/application/services/auth.service.spec.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/application/services
git commit -m "feat: add auth service with register, login and me"
```

---

### Task 7: Controller, module wiring, and configuration

Exposes the three routes, assembles `AuthModule`, registers both modules on `AppModule`, and adds the JWT settings. After this task the feature is complete.

**Files:**

- Create: `src/modules/auth/api/auth.controller.ts`
- Create: `src/modules/auth/auth.module.ts`
- Modify: `src/app.module.ts`
- Modify: `.env`
- Test: `src/modules/auth/api/auth.controller.spec.ts`

**Interfaces:**

- Consumes: `AuthService` (Task 6); `RegisterDto`, `LoginDto`, `AuthResponse`, `UserResponse` (Task 5); `PASSWORD_HASHER` + `BcryptPasswordHasher` (Task 4); `UserModule` (Task 3); `JwtAuthGuard`, `JwtPayload`, `User` decorator from `src/shared/common/`.
- Produces: `class AuthController`, `class AuthModule`. Nothing consumes them.

`.env` is gitignored, so the new variables are documented in the commit message and in the plan rather than committed.

- [ ] **Step 1: Add the JWT settings to `.env`**

Generate a secret and append both variables:

```bash
printf 'JWT_SECRET=%s\nJWT_EXPIRES_IN=86400\n' "$(openssl rand -base64 48)" >> .env
```

`JWT_EXPIRES_IN` is **seconds** (86400 = 1 day). Both are read with `getOrThrow`, so the app refuses to boot if either is missing rather than signing tokens with `undefined`.

- [ ] **Step 2: Write the failing test**

Create `src/modules/auth/api/auth.controller.spec.ts`:

```ts
import { UUID } from 'crypto';
import { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { SystemRole } from '../../../shared/domain/enum';
import { AuthService } from '../application/services/auth.service';
import { AuthController } from './auth.controller';

const token: JwtPayload = {
  sub: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0' as UUID,
  email: 'quangha@example.com',
  role: SystemRole.Employee,
};

describe('AuthController', () => {
  let service: { register: jest.Mock; login: jest.Mock; me: jest.Mock };
  let controller: AuthController;

  beforeEach(() => {
    service = {
      register: jest.fn().mockResolvedValue({ accessToken: 'a' }),
      login: jest.fn().mockResolvedValue({ accessToken: 'b' }),
      me: jest.fn().mockResolvedValue({ publicId: token.sub }),
    };
    controller = new AuthController(service as unknown as AuthService);
  });

  it('hands the registration body to the service untouched', async () => {
    const body = {
      username: 'quangha',
      email: 'quangha@example.com',
      password: 'sup3rsecret',
    };

    await expect(controller.register(body)).resolves.toEqual({
      accessToken: 'a',
    });
    expect(service.register).toHaveBeenCalledWith(body);
  });

  it('hands the login body to the service untouched', async () => {
    const body = { email: 'quangha@example.com', password: 'sup3rsecret' };

    await expect(controller.login(body)).resolves.toEqual({ accessToken: 'b' });
    expect(service.login).toHaveBeenCalledWith(body);
  });

  it('looks the profile up by the token subject, not by the email', async () => {
    await controller.me(token);

    expect(service.me).toHaveBeenCalledWith(token.sub);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/modules/auth/api/auth.controller.spec.ts`
Expected: FAIL — `Cannot find module './auth.controller'`.

- [ ] **Step 4: Write the controller**

Create `src/modules/auth/api/auth.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/common/jwt.guard';
import { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { User } from '../../../shared/common/user.decorator';
import { AuthResponse } from '../application/dtos/auth.response';
import { LoginDto } from '../application/dtos/login.dto';
import { RegisterDto } from '../application/dtos/register.dto';
import { UserResponse } from '../application/dtos/user.response';
import { AuthService } from '../application/services/auth.service';

// The `api/` prefix is required: LoggerMiddleware is only applied to `api/*`.
@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new account' })
  @ApiResponse({ status: 201, type: AuthResponse })
  @ApiResponse({ status: 409, description: 'Email is already registered' })
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto);
  }

  @Post('login')
  // Nest answers POST with 201 by default; a login creates nothing.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in and receive an access token' })
  @ApiResponse({ status: 200, type: AuthResponse })
  @ApiResponse({ status: 401, description: 'Email or password is incorrect' })
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  // No RolesGuard here: it throws Forbidden on any route without @Roles(),
  // and every authenticated user may read their own profile.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read the authenticated user profile' })
  @ApiResponse({ status: 200, type: UserResponse })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  me(@User() user: JwtPayload): Promise<UserResponse> {
    return this.authService.me(user.sub);
  }
}
```

- [ ] **Step 5: Write `AuthModule`**

Create `src/modules/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../user/user.module';
import { AuthController } from './api/auth.controller';
import { PASSWORD_HASHER } from './application/interfaces/password-hasher.interface';
import { AuthService } from './application/services/auth.service';
import { BcryptPasswordHasher } from './infrastructure/bcrypt.hasher';

@Module({
  imports: [
    UserModule,
    JwtModule.registerAsync({
      // Global so JwtAuthGuard can inject JwtService from any module without
      // each of them re-importing JwtModule.
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // Seconds. A string like '1d' does not satisfy the SignOptions type.
          expiresIn: Number(config.getOrThrow<string>('JWT_EXPIRES_IN')),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
  ],
})
export class AuthModule {}
```

- [ ] **Step 6: Register both modules on `AppModule`**

In `src/app.module.ts`, add the two imports at the top and put the modules in the `imports` array. Leave the rest of the file — the `LoggerMiddleware` wiring and the `APP_PIPE` provider — as it is.

```ts
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
```

```ts
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    ConfigModule,
    UserModule,
    AuthModule,
  ],
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- src/modules/auth/api/auth.controller.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 8: Run the whole suite, the linter, and the build**

```bash
npm test
npm run lint
npm run build
```

Expected: all suites pass (42 tests across 7 files — 4 filter, 4 mapper, 6 repo, 4 hasher, 8 dto, 13 service, 3 controller), no lint errors, build exits 0.

- [ ] **Step 9: Confirm the app boots and the routes are mapped**

```bash
timeout 25 npm run start:dev 2>&1 | grep -E "Mapped|AuthModule|Nest application successfully started|ERROR"
```

Expected output includes:

```
Mapped {/api/auth/register, POST}
Mapped {/api/auth/login, POST}
Mapped {/api/auth/me, GET}
Nest application successfully started
```

The database is unreachable in this environment, so do not try to call the endpoints — route mapping plus a clean boot is the check here. If the boot fails on `JWT_SECRET`, Step 1 was not applied.

- [ ] **Step 10: Commit**

```bash
git add src/modules/auth src/app.module.ts
git commit -m "feat: add auth controller, module and app wiring

Requires two new .env variables (.env is gitignored):
  JWT_SECRET=<openssl rand -base64 48>
  JWT_EXPIRES_IN=86400   # seconds"
```

---

## Verification checklist

Run after Task 7:

- [ ] `npm test` — 7 suites, all green
- [ ] `npm run lint` — no errors
- [ ] `npm run build` — exit 0
- [ ] App boots and maps `/api/auth/register`, `/api/auth/login`, `/api/auth/me`
- [ ] Swagger at `http://localhost:3000/docs` lists the three routes under the `auth` tag, with a padlock on `/api/auth/me`

Once a working `DATABASE_URL` exists, the end-to-end pass a human should do:

```bash
curl -sX POST localhost:3000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"quangha","email":"quangha@example.com","password":"sup3rsecret"}'
# expect 201 and an accessToken

curl -sX POST localhost:3000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"quangha","email":"quangha@example.com","password":"sup3rsecret"}'
# expect 409 "Email is already registered"  <- proves Task 1 works end to end

curl -sX POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"quangha@example.com","password":"wrong"}'
# expect 401 "Email or password is incorrect"

TOKEN=$(curl -sX POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"quangha@example.com","password":"sup3rsecret"}' | jq -r .accessToken)
curl -s localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
# expect 200 with publicId/username/email/role and no password field

curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/auth/me
# expect 401
```
