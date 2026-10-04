import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import request from 'supertest';
import type { Server } from 'http';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { PageResult } from 'src/shared/common/pagination';
import {
  CommonDocumentStatus,
  CommonDocumentType,
  CommonDocumentVisibility,
  SystemRole,
} from 'src/shared/domain/enum';
import { DocumentListResponseDto } from '../application/dtos/document.response.dto';
import { IDocumentService } from '../application/interfaces/document.service.interface';
import { DocumentController } from './document.controller';

describe('DocumentController search HTTP', () => {
  const spaceId = '6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b';
  const userId = '8d4c2a1e-5b3f-4a6d-9e2c-1f7a3b5d9c0e';
  const path = `/api/knowledge-spaces/${spaceId}/documents/search`;
  const service = {
    deleteDocumentAsync: jest.fn().mockResolvedValue(ok(undefined)),
    restoreDocumentAsync: jest.fn().mockResolvedValue(ok({ publicId: userId })),
    getDocumentTrashAsync: jest
      .fn()
      .mockResolvedValue(ok(new PageResult([], 0, 1, 1, 20))),
    searchDocumentsAsync: jest.fn(),
    getDocumentDetailAsync: jest.fn(),
  };
  let app: INestApplication;
  let jwt: JwtService;
  let server: Server;
  let token: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'document-search-test-secret' })],
      controllers: [DocumentController],
      providers: [{ provide: IDocumentService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    server = app.getHttpServer() as Server;
    jwt = module.get(JwtService);
    token = jwt.sign({
      sub: userId,
      email: 'user@example.com',
      role: SystemRole.Employee,
    });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    service.searchDocumentsAsync.mockResolvedValue(
      ok(new PageResult([], 0, 1, 1, 20)),
    );
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
  });

  it('documents trash, delete and restore responses, UUIDs and errors in Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const base = '/api/knowledge-spaces/{knowledgeSpacePublicId}/documents';
    const trash = document.paths[`${base}/trash`].get!;
    const deletion = document.paths[`${base}/{documentPublicId}`].delete!;
    const restore = document.paths[`${base}/{documentPublicId}/restore`].post!;
    expect(Object.keys(trash.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '500']),
    );
    expect(Object.keys(deletion.responses)).toEqual(
      expect.arrayContaining(['204', '409']),
    );
    expect(Object.keys(restore.responses)).toEqual(
      expect.arrayContaining(['200', '409', '410']),
    );
    expect(restore.requestBody).toBeUndefined();
    expect(deletion.requestBody).toBeUndefined();
    expect(restore.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'documentPublicId',
          schema: expect.objectContaining({ format: 'uuid' }) as object,
        }),
      ]),
    );
  });

  it('routes trash before the dynamic document route and takes identity from JWT', async () => {
    await request(server)
      .get(path.replace('/search', '/trash'))
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(service.getDocumentTrashAsync).toHaveBeenCalledWith(
      spaceId,
      userId,
      { pageNumber: 1, pageSize: 20 },
    );
    expect(service.getDocumentDetailAsync).not.toHaveBeenCalled();
  });
  it('deletes without a body and returns empty 204', async () => {
    const response = await request(server)
      .delete(path.replace('/search', `/${userId}`))
      .auth(token, { type: 'bearer' })
      .expect(204);
    expect(response.text).toBe('');
    expect(service.deleteDocumentAsync).toHaveBeenCalledWith(
      spaceId,
      userId,
      userId,
    );
  });
  it('restores without a body and returns 200', async () => {
    await request(server)
      .post(path.replace('/search', `/${userId}/restore`))
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(service.restoreDocumentAsync).toHaveBeenCalledWith(
      spaceId,
      userId,
      userId,
    );
  });
  it.each([
    ['CONFLICT', 409],
    ['GONE', 410],
    ['NOT_FOUND', 404],
    ['FORBIDDEN', 403],
    ['INTERNAL_SERVER_ERROR', 500],
  ])('maps restore %s to %i', async (code, status) => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    service.restoreDocumentAsync.mockResolvedValueOnce(
      err(new AppError(code as ErrorCode, 'cannot restore')),
    );
    await request(server)
      .post(path.replace('/search', `/${userId}/restore`))
      .auth(token, { type: 'bearer' })
      .expect(status);
  });
  it.each(['delete', 'restore', 'trash'])(
    'validates UUID and guards for %s',
    async (action) => {
      const valid = path.replace(
        '/search',
        action === 'trash'
          ? '/trash'
          : `/${userId}${action === 'restore' ? '/restore' : ''}`,
      );
      const method =
        action === 'trash' ? 'get' : action === 'restore' ? 'post' : 'delete';
      await request(server)[method](valid).expect(401);
      await request(server)
        [method](valid)
        .auth(jwt.sign({ sub: userId, role: 'unknown' }), { type: 'bearer' })
        .expect(403);
      await request(server)
        [method](valid.replace(spaceId, 'invalid'))
        .auth(token, { type: 'bearer' })
        .expect(400);
      if (action !== 'trash')
        await request(server)
          [method](valid.replace(userId, 'invalid'))
          .auth(token, { type: 'bearer' })
          .expect(400);
    },
  );

  it('routes /search correctly and uses JWT identity, trimmed name and default pagination', async () => {
    const response = await request(server)
      .get(path)
      .auth(token, { type: 'bearer' })
      .query({ documentName: '  Handbook  ', userPublicId: 'spoofed-user' })
      .expect(200);
    expect(response.body).toMatchObject({
      items: [],
      pageNumber: 1,
      pageSize: 20,
    });
    expect(service.searchDocumentsAsync).toHaveBeenCalledWith(spaceId, userId, {
      documentName: 'Handbook',
      pageNumber: 1,
      pageSize: 20,
    });
    expect(service.getDocumentDetailAsync).not.toHaveBeenCalled();
  });

  it('accepts admin JWTs and explicit pagination', async () => {
    const adminToken = jwt.sign({
      sub: userId,
      email: 'admin@example.com',
      role: SystemRole.Admin,
    });
    await request(server)
      .get(path)
      .auth(adminToken, { type: 'bearer' })
      .query({ documentName: 'Guide', pageNumber: '2', pageSize: '5' })
      .expect(200);
    expect(service.searchDocumentsAsync).toHaveBeenCalledWith(spaceId, userId, {
      documentName: 'Guide',
      pageNumber: 2,
      pageSize: 5,
    });
  });

  it.each([
    {},
    { documentName: '' },
    { documentName: '   ' },
    { documentName: ['Guide', 'Handbook'] },
    { documentName: 'Guide', pageNumber: 0 },
    { documentName: 'Guide', pageSize: 1.5 },
  ])('rejects invalid queries: %p', async (query) => {
    await request(server)
      .get(path)
      .auth(token, { type: 'bearer' })
      .query(query)
      .expect(400);
    expect(service.searchDocumentsAsync).not.toHaveBeenCalled();
  });

  it('validates the knowledge space UUID', async () => {
    await request(server)
      .get('/api/knowledge-spaces/not-a-uuid/documents/search')
      .auth(token, { type: 'bearer' })
      .query({ documentName: 'Guide' })
      .expect(400);
    expect(service.searchDocumentsAsync).not.toHaveBeenCalled();
  });

  it('requires a valid JWT', async () => {
    await request(server)
      .get(path)
      .query({ documentName: 'Guide' })
      .expect(401);
    await request(server)
      .get(path)
      .auth('invalid', { type: 'bearer' })
      .query({ documentName: 'Guide' })
      .expect(401);
    expect(service.searchDocumentsAsync).not.toHaveBeenCalled();
  });

  it.each([
    [ErrorCode.Forbidden, 403],
    [ErrorCode.InternalServerError, 500],
  ])('maps %s to HTTP %i', async (code, status) => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    service.searchDocumentsAsync.mockResolvedValueOnce(
      err(new AppError(code, 'Search failed')),
    );
    await request(server)
      .get(path)
      .auth(token, { type: 'bearer' })
      .query({ documentName: 'Guide' })
      .expect(status);
  });
});

describe('DocumentController retry HTTP', () => {
  const spaceId = '6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b';
  const documentId = '8d4c2a1e-5b3f-4a6d-9e2c-1f7a3b5d9c0e';
  const userId = 'a1b2c3d4-e5f6-4789-9abc-def012345678';
  const path = `/api/knowledge-spaces/${spaceId}/documents/${documentId}/retry`;
  const service = { retryIngestDocumentAsync: jest.fn() };
  const item: DocumentListResponseDto = {
    publicId: documentId,
    title: 'Guide.txt',
    fileType: CommonDocumentType.TXT,
    status: CommonDocumentStatus.Processing,
    visibility: CommonDocumentVisibility.Restricted,
    lastUpdated: new Date('2026-10-04T12:00:00Z'),
    category: { publicId: 'category', name: 'Guides' },
    updatedBy: { publicId: userId, name: 'Author', avatarUrl: null },
    cited: 0,
  };
  let app: INestApplication;
  let jwt: JwtService;
  let server: Server;
  let token: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'document-retry-test-secret' })],
      controllers: [DocumentController],
      providers: [{ provide: IDocumentService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    server = app.getHttpServer() as Server;
    jwt = module.get(JwtService);
    token = jwt.sign({
      sub: userId,
      email: 'user@example.com',
      role: SystemRole.Employee,
    });
  });
  beforeEach(() => {
    service.retryIngestDocumentAsync.mockReset().mockResolvedValue(ok(item));
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
  });

  it('accepts a bodyless POST, uses JWT identity and returns the Processing snapshot as 202', async () => {
    const response = await request(server)
      .post(path)
      .auth(token, { type: 'bearer' })
      .expect(202);
    expect(response.body).toEqual({
      ...item,
      lastUpdated: '2026-10-04T12:00:00.000Z',
    });
    expect(service.retryIngestDocumentAsync).toHaveBeenCalledWith(
      spaceId,
      userId,
      documentId,
    );
  });

  it('ignores user identity in a supplied body', async () => {
    await request(server)
      .post(path)
      .auth(token, { type: 'bearer' })
      .send({ userPublicId: 'spoofed' })
      .expect(202);
    expect(service.retryIngestDocumentAsync).toHaveBeenCalledWith(
      spaceId,
      userId,
      documentId,
    );
  });

  it('accepts an Admin JWT', async () => {
    const admin = jwt.sign({
      sub: userId,
      email: 'admin@example.com',
      role: SystemRole.Admin,
    });
    await request(server)
      .post(path)
      .auth(admin, { type: 'bearer' })
      .expect(202);
  });

  it.each([
    '/api/knowledge-spaces/invalid/documents/8d4c2a1e-5b3f-4a6d-9e2c-1f7a3b5d9c0e/retry',
    '/api/knowledge-spaces/6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b/documents/invalid/retry',
  ])('rejects invalid UUIDs: %s', async (invalidPath) => {
    await request(server)
      .post(invalidPath)
      .auth(token, { type: 'bearer' })
      .expect(400);
    expect(service.retryIngestDocumentAsync).not.toHaveBeenCalled();
  });

  it('requires a valid JWT', async () => {
    await request(server).post(path).expect(401);
    await request(server)
      .post(path)
      .auth('invalid', { type: 'bearer' })
      .expect(401);
    expect(service.retryIngestDocumentAsync).not.toHaveBeenCalled();
  });

  it('rejects JWTs with a disallowed system role', async () => {
    const other = jwt.sign({
      sub: userId,
      email: 'user@example.com',
      role: 'other',
    });
    await request(server)
      .post(path)
      .auth(other, { type: 'bearer' })
      .expect(403);
    expect(service.retryIngestDocumentAsync).not.toHaveBeenCalled();
  });

  it.each([
    [ErrorCode.BadRequest, 400],
    [ErrorCode.Unauthorized, 401],
    [ErrorCode.Forbidden, 403],
    [ErrorCode.NotFound, 404],
    [ErrorCode.Conflict, 409],
    [ErrorCode.InternalServerError, 500],
  ])('maps %s to HTTP %i', async (code, status) => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    service.retryIngestDocumentAsync.mockResolvedValueOnce(
      err(new AppError(code, 'Retry failed')),
    );
    const response = await request(server)
      .post(path)
      .auth(token, { type: 'bearer' })
      .expect(status);
    expect(response.body).toMatchObject({
      statusCode: status,
      message: 'Retry failed',
    });
  });
});
