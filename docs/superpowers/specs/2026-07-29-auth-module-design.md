# Auth module design

Ngày: 2026-07-29

## Mục tiêu

Dựng module `auth` (đăng ký / đăng nhập / lấy profile) và module `user` tối thiểu làm nền cho nó. Sau khi xong, mọi module khác có thể gắn `JwtAuthGuard` + `@Roles()` lên route và chúng hoạt động ngay.

## Phạm vi

| Endpoint | Guard | Request body | Response |
| --- | --- | --- | --- |
| `POST /api/auth/register` | — | `{ username, email, password }` | `201 { accessToken, expiresIn, user }` |
| `POST /api/auth/login` | — | `{ email, password }` | `200 { accessToken, expiresIn, user }` |
| `GET /api/auth/me` | `JwtAuthGuard` | — | `200 { publicId, username, email, role }` |

Ngoài phạm vi (làm sau, spec riêng): refresh token, logout, đổi mật khẩu, quên mật khẩu, CRUD user, quản lý `UserWorkspace`.

Không thay đổi Prisma schema, **không cần migration**.

## Quyết định đã chốt

- `register` là self-register công khai. Role luôn là `Employee`; không có đường tạo `Admin` qua API (set tay trong DB hoặc seed script sau này).
- `/me` query lại DB theo `publicId` trong token thay vì echo payload, để token cũ không trả về role đã stale.
- Prefix route là `api/` vì `LoggerMiddleware` chỉ áp cho `api/*path`.
- `/me` **không** gắn `RolesGuard`. `RolesGuard` throw `Forbidden` khi route thiếu `@Roles()` metadata, mà `/me` thì mọi user đã đăng nhập đều được vào.
- Chưa làm refresh token. Chỉ có access token, TTL mặc định `1d`.
- Module `user` chỉ dựng phần auth cần: entity, repo interface, Prisma repo, mapper. Chưa có controller hay service.
- `auth/domain/` chỉ chứa `errors/`.

### Password hasher: port + adapter, không dùng value object

Ban đầu cân nhắc một value object `Password` trong `auth/domain/` bọc bcrypt. Chọn port + adapter thay thế:

- `IPasswordHasher` (`auth/application/interfaces/`) — port.
- `BcryptPasswordHasher` (`auth/infrastructure/`) — adapter.

Lý do: bcrypt là dependency kỹ thuật, đặt trong `domain/` là ngược hướng phụ thuộc. Tách ra thì `AuthService` test được bằng hasher giả, không phải chờ bcrypt chạy thật (bcrypt cố tình chậm ~100ms mỗi lần).

## Cấu trúc thư mục

```
src/modules/user/
├── user.module.ts                            provides + exports USER_REPOSITORY
├── domain/
│   ├── entities/user.entity.ts               UserEntity (gồm cả password hash)
│   └── repositories/user.repo.interface.ts   IUserRepo + token USER_REPOSITORY
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

## Hợp đồng giữa các tầng

### `UserEntity`

```ts
{
  id: number;          // nội bộ, dùng cho FK/join
  publicId: string;    // lộ ra ngoài
  username: string;
  email: string;
  password: string;    // bcrypt hash, không bao giờ vào response
  role: SystemRole;    // đã map từ Prisma Role
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

`create` nhận password đã hash — hashing là việc của `AuthService`, repo không biết bcrypt.

DI token: `export const USER_REPOSITORY = Symbol('USER_REPOSITORY')`, đặt cạnh interface. `UserModule` bind token → `UserPrismaRepo` và export token.

### `IPasswordHasher`

```ts
hash(plain: string): Promise<string>
compare(plain: string, hash: string): Promise<boolean>
```

`BcryptPasswordHasher` dùng `bcrypt` với `SALT_ROUNDS = 10`.

### Domain errors

`auth/domain/errors/auth.errors.ts`, tất cả extends `AppError` để `toHttpException` map đúng status:

- `InvalidCredentialsError` → `ErrorCode.Unauthorized`, message `'Email or password is incorrect'`
- `EmailAlreadyExistsError` → `ErrorCode.Conflict`, message `'Email is already registered'`
- `UserNotFoundError` → `ErrorCode.NotFound`, message `'User not found'`

Login sai email và login sai password đều ném `InvalidCredentialsError` với **cùng một message**, để không lộ ra email nào đã tồn tại trong hệ thống.

### DTO validation

`RegisterDto`:
- `username`: `@IsString()`, `@Length(3, 50)`
- `email`: `@IsEmail()`
- `password`: `@IsString()`, `@MinLength(8)`

`LoginDto`:
- `email`: `@IsEmail()`
- `password`: `@IsString()`, `@IsNotEmpty()`

Global `ValidationPipe` đã bật `whitelist: true` nên field thừa bị strip tự động. Mỗi field gắn `@ApiProperty()` để Swagger ở `/docs` hiển thị đúng.

### Response shape

```ts
UserResponse  { publicId, username, email, role }        // không có password
AuthResponse  { accessToken, expiresIn, user: UserResponse }
```

`expiresIn` là chuỗi TTL lấy từ config (ví dụ `'1d'`), trả về để client biết khi nào cần đăng nhập lại.

## Luồng xử lý

### register

1. `ValidationPipe` validate `RegisterDto`.
2. `userRepo.findByEmail(email)` → nếu có → ném `EmailAlreadyExistsError`.
3. `hasher.hash(password)` — **chỉ chạy khi email chưa tồn tại**, không phí ~100ms bcrypt cho request chắc chắn fail.
4. `userRepo.create({ ..., role: SystemRole.Employee })`.
5. Ký JWT, trả `AuthResponse` với status 201.

**Race condition:** hai request cùng email vào đồng thời có thể cùng qua được bước 2. Unique constraint trên `User.email` sẽ chặn ở bước 4 với lỗi Prisma `P2002`. `UserPrismaRepo.create` bắt `P2002` và ném lại `EmailAlreadyExistsError`. Check ở bước 2 để tránh hash thừa (case thường); constraint để đảm bảo đúng (case hiếm).

### login

1. Validate `LoginDto`.
2. `userRepo.findByEmail(email)` → không có → `InvalidCredentialsError`.
3. `hasher.compare(password, user.password)` → false → `InvalidCredentialsError`.
4. Ký JWT, trả `AuthResponse` với status 200 (`@HttpCode(200)` vì Nest mặc định POST là 201).

### me

1. `JwtAuthGuard` verify Bearer token, gắn `request.user`.
2. `@User()` lấy payload, dùng `sub` (= `publicId`).
3. `userRepo.findByPublicId(sub)` → không có → `UserNotFoundError` (token hợp lệ nhưng user đã bị xoá).
4. Trả `UserResponse`.

### JWT payload

`{ sub: publicId, email, role: SystemRole }` — khớp `JwtPayload` interface có sẵn nên `JwtAuthGuard` chạy được ngay, không phải sửa.

`JwtPayload.sub` khai báo kiểu `UUID` (từ `node:crypto`) trong khi `publicId` là `string`, nên chỗ ký token cần ép `publicId as UUID`.

## Thay đổi ở `src/shared/`

### 1. `exceptions.filter.ts` — nối `toHttpException` vào hệ thống

`AllExceptionsFilter` hiện chỉ hiểu `HttpException`; `AppError` ném từ service sẽ ra `500 Internal Server Error` và nuốt mất message. `toHttpException()` đã tồn tại nhưng chưa được gọi ở đâu cả.

Sửa: đầu `catch()`, nếu `exception instanceof AppError` thì thay bằng `toHttpException(exception)` trước khi chạy logic sẵn có. Khoảng 3 dòng.

Phương án đã cân nhắc và loại:
- `try/catch` + `toHttpException` ở từng controller — lặp lại ở mọi route của mọi module.
- Cài `neverthrow` để dùng `Result` như doc comment mô tả — thêm dependency và đổi chữ ký toàn bộ service, quá lớn so với nhu cầu hiện tại.

Cách đã chọn sửa một chỗ và mọi module sau này hưởng lợi.

### 2. Map enum `Role` ↔ `SystemRole`

Prisma `Role` là `Admin`/`Employee`; `SystemRole` (dùng bởi `RolesGuard` và `JwtPayload`) là `admin`/`employee`. `user.mapper.ts` giữ cả hai chiều. Token luôn mang `SystemRole` để `RolesGuard` so sánh đúng.

Mapper đặt trong `user/infrastructure/` chứ không phải `shared/` — hiện chỉ module user cần nó.

## Config

Thêm vào `.env`:

```
JWT_SECRET=<random string>
JWT_EXPIRES_IN=1d
```

`AuthModule` dùng `JwtModule.registerAsync({ global: true, inject: [ConfigService], ... })` với `ConfigService.getOrThrow('JWT_SECRET')` — app fail-fast lúc boot nếu thiếu secret, thay vì ký token bằng `undefined`.

`global: true` để `JwtAuthGuard` inject được `JwtService` ở mọi module khác (knowledge-space và các module sau) mà không phải import `JwtModule` lại từng nơi.

`AppModule` import thêm `AuthModule` và `UserModule`.

## Test

`auth.service.spec.ts` — unit test với `IUserRepo`, `IPasswordHasher`, `JwtService` đều mock, không đụng DB:

- register thành công: gọi `create` với password đã hash và role `Employee`, trả về token
- register khi email đã tồn tại: ném `EmailAlreadyExistsError`, và **không** gọi `hasher.hash`
- register khi repo ném `P2002`: ném `EmailAlreadyExistsError`
- login thành công
- login khi không tìm thấy email: ném `InvalidCredentialsError`
- login khi sai password: ném `InvalidCredentialsError` với cùng message như case trên
- me khi user không tồn tại: ném `UserNotFoundError`
- response không bao giờ chứa field `password`

Tiêu chí hoàn thành: `npm test` xanh, `npm run lint` sạch, `npm run build` thành công (pre-push hook chạy build).
