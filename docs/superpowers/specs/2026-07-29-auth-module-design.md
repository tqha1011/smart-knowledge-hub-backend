# Auth module design

Date: 2026-07-29

## Goal

Build the `auth` module (register / login / get profile) plus the minimal `user` module it depends on. Once this ships, any other module can put `JwtAuthGuard` + `@Roles()` on a route and have it work.

## Scope

| Endpoint                  | Guard          | Request body                    | Response                                  |
| ------------------------- | -------------- | ------------------------------- | ----------------------------------------- |
| `POST /api/auth/register` | —              | `{ username, email, password }` | `201 { accessToken, expiresIn, user }`    |
| `POST /api/auth/login`    | —              | `{ email, password }`           | `200 { accessToken, expiresIn, user }`    |
| `GET /api/auth/me`        | `JwtAuthGuard` | —                               | `200 { publicId, username, email, role }` |

Out of scope (separate specs later): refresh tokens, logout, change password, forgot password, user CRUD, `UserWorkspace` management.

No Prisma schema changes, so **no migration needed**.

## Decisions

- `register` is public self-registration. Role is always `Employee`; there is no API path to create an `Admin` (set it directly in the DB or via a seed script later).
- `/me` re-reads the DB by the token's `publicId` instead of echoing the payload, so an old token never returns a stale role.
- Routes are prefixed with `api/` because `LoggerMiddleware` only applies to `api/*path`.
- `/me` does **not** use `RolesGuard`. That guard throws `Forbidden` when a route has no `@Roles()` metadata, and `/me` should be reachable by any authenticated user.
- No refresh tokens. Access token only, default TTL `1d`.
- The `user` module only gets what auth needs: entity, repo interface, Prisma repo, mapper. No controller or service yet.
- `auth/domain/` contains only `errors/`.

### Password hasher: port + adapter, not a value object

A `Password` value object in `auth/domain/` wrapping bcrypt was considered. Port + adapter won instead:

- `IPasswordHasher` (`auth/application/interfaces/`) — the port.
- `BcryptPasswordHasher` (`auth/infrastructure/`) — the adapter.

Reason: bcrypt is a technical dependency, so putting it in `domain/` inverts the dependency direction. Splitting it also lets `AuthService` be tested with a fake hasher instead of waiting on real bcrypt, which is deliberately slow (~100ms per call).

## Directory layout

```plaintext
src/modules/user/
├── user.module.ts                            provides + exports USER_REPOSITORY
├── domain/
│   ├── entities/user.entity.ts               UserEntity (includes the password hash)
│   └── repositories/user.repo.interface.ts   IUserRepo + USER_REPOSITORY token
└── infrastructure/
    ├── user.repo.ts                          UserPrismaRepo implements IUserRepo
    └── user.mapper.ts                        Prisma User ↔ UserEntity, Role ↔ SystemRole

src/modules/auth/
├── auth.module.ts                            JwtModule.registerAsync({ global: true })
├── api/auth.controller.ts
├── application/
│   ├── dtos/register.dto.ts
│   ├── dtos/login.dto.ts
│   ├── dtos/auth.response.ts
│   ├── dtos/user.response.ts
│   ├── interfaces/password-hasher.interface.ts   IPasswordHasher + PASSWORD_HASHER
│   └── services/auth.service.ts
├── domain/errors/auth.errors.ts
└── infrastructure/bcrypt.hasher.ts
```

## Contracts between layers

### `UserEntity`

```ts
{
  id: number; // internal, used for FKs and joins
  publicId: string; // the one exposed externally
  username: string;
  email: string;
  password: string; // bcrypt hash, never reaches a response
  role: SystemRole; // already mapped from the Prisma Role
  createdAt: Date;
  updatedAt: Date;
}
```

### `IUserRepo`

```ts
findByEmail(email: string): Promise<UserEntity | null>
findByPublicId(publicId: string): Promise<UserEntity | null>
create(input: { username: string; email: string; password: string; role: SystemRole }): Promise<UserEntity>
```

`create` receives an already-hashed password — hashing belongs to `AuthService`, and the repo knows nothing about bcrypt.

DI token: `export const USER_REPOSITORY = Symbol('USER_REPOSITORY')`, declared next to the interface. `UserModule` binds the token to `UserPrismaRepo` and exports it.

### `IPasswordHasher`

```ts
hash(plain: string): Promise<string>
compare(plain: string, hash: string): Promise<boolean>
```

`BcryptPasswordHasher` uses `bcrypt` with `SALT_ROUNDS = 10`.

### Domain errors

In `auth/domain/errors/auth.errors.ts`, all extending `AppError` so `toHttpException` maps them to the right status:

- `InvalidCredentialsError` → `ErrorCode.Unauthorized`, message `'Email or password is incorrect'`
- `EmailAlreadyExistsError` → `ErrorCode.Conflict`, message `'Email is already registered'`
- `UserNotFoundError` → `ErrorCode.NotFound`, message `'User not found'`

A wrong email and a wrong password both raise `InvalidCredentialsError` with the **same message**, so the endpoint never reveals which emails exist.

### DTO validation

`RegisterDto`:

- `username`: `@IsString()`, `@Length(3, 50)`
- `email`: `@IsEmail()`
- `password`: `@IsString()`, `@MinLength(8)`

`LoginDto`:

- `email`: `@IsEmail()`
- `password`: `@IsString()`, `@IsNotEmpty()`

The global `ValidationPipe` already sets `whitelist: true`, so unknown fields are stripped automatically. Every field carries `@ApiProperty()` so Swagger at `/docs` renders correctly.

### Response shapes

```ts
UserResponse  { publicId, username, email, role }        // no password
AuthResponse  { accessToken, expiresIn, user: UserResponse }
```

`expiresIn` is the TTL string from config (e.g. `'1d'`), returned so the client knows when it needs to log in again.

## Flows

### register

1. `ValidationPipe` validates `RegisterDto`.
2. `userRepo.findByEmail(email)` → if found, raise `EmailAlreadyExistsError`.
3. `hasher.hash(password)` — **only runs when the email is free**, so no ~100ms of bcrypt is spent on a request that is guaranteed to fail.
4. `userRepo.create({ ..., role: SystemRole.Employee })`.
5. Sign the JWT, return `AuthResponse` with status 201.

**Race condition:** two concurrent requests with the same email can both pass step 2. The unique constraint on `User.email` stops the second one at step 4 with Prisma error `P2002`. `UserPrismaRepo.create` catches `P2002` and re-raises `EmailAlreadyExistsError`. The step-2 check avoids wasted hashing (the common case); the constraint guarantees correctness (the rare case).

### login

1. Validate `LoginDto`.
2. `userRepo.findByEmail(email)` → not found → `InvalidCredentialsError`.
3. `hasher.compare(password, user.password)` → false → `InvalidCredentialsError`.
4. Sign the JWT, return `AuthResponse` with status 200 (`@HttpCode(200)`, since Nest defaults POST to 201).

### me

1. `JwtAuthGuard` verifies the Bearer token and attaches `request.user`.
2. `@User()` pulls the payload; `sub` is the `publicId`.
3. `userRepo.findByPublicId(sub)` → not found → `UserNotFoundError` (valid token, but the user was deleted).
4. Return `UserResponse`.

### JWT payload

`{ sub: publicId, email, role: SystemRole }` — matches the existing `JwtPayload` interface, so `JwtAuthGuard` works as-is with no changes.

`JwtPayload.sub` is typed as `UUID` (from `node:crypto`) while `publicId` is a `string`, so the signing site needs `publicId as UUID`.

## Changes in `src/shared/`

### 1. `exceptions.filter.ts` — wire up `toHttpException`

`AllExceptionsFilter` currently only understands `HttpException`. An `AppError` thrown from a service becomes `500 Internal Server Error` and its message is swallowed. `toHttpException()` already exists but nothing calls it.

Fix: at the top of `catch()`, if `exception instanceof AppError`, replace it with `toHttpException(exception)` before the existing logic runs. About 3 lines.

Alternatives considered and rejected:

- `try/catch` + `toHttpException` in every controller — repeated in every route of every module.
- Install `neverthrow` to use the `Result` pattern the doc comment describes — adds a dependency and changes every service signature, far too large for the current need.

The chosen fix touches one file and every future module benefits.

### 2. Mapping `Role` ↔ `SystemRole`

Prisma's `Role` is `Admin`/`Employee`; `SystemRole` (used by `RolesGuard` and `JwtPayload`) is `admin`/`employee`. `user.mapper.ts` holds both directions. Tokens always carry `SystemRole` so `RolesGuard` compares correctly.

The mapper lives in `user/infrastructure/`, not `shared/` — only the user module needs it today.

## Config

Add to `.env`:

```plaintext
JWT_SECRET=<random string>
JWT_EXPIRES_IN=1d
```

`AuthModule` uses `JwtModule.registerAsync({ global: true, inject: [ConfigService], ... })` with `ConfigService.getOrThrow('JWT_SECRET')`, so the app fails fast at boot on a missing secret instead of signing tokens with `undefined`.

`global: true` lets `JwtAuthGuard` inject `JwtService` from any other module (knowledge-space and whatever comes next) without re-importing `JwtModule` each time.

`AppModule` additionally imports `AuthModule` and `UserModule`.

## Tests

`auth.service.spec.ts` — unit tests with `IUserRepo`, `IPasswordHasher`, and `JwtService` all mocked, no DB:

- register succeeds: calls `create` with the hashed password and role `Employee`, returns a token
- register with an existing email: raises `EmailAlreadyExistsError` and does **not** call `hasher.hash`
- register when the repo raises `P2002`: raises `EmailAlreadyExistsError`
- login succeeds
- login with an unknown email: raises `InvalidCredentialsError`
- login with a wrong password: raises `InvalidCredentialsError` with the same message as the case above
- responses never contain a `password` field

Done means: `npm test` green, `npm run lint` clean, `npm run build` succeeds (the pre-push hook runs the build).
