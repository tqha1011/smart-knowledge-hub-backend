import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import request from 'supertest';
import type { Server } from 'http';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { PageResult } from 'src/shared/common/pagination';
import { SystemRole } from 'src/shared/domain/enum';
import { IDocumentService } from '../application/interfaces/document.service.interface';
import { DocumentController } from './document.controller';

describe('DocumentController search HTTP', () => {
  const spaceId = '6b1f2e3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b';
  const userId = '8d4c2a1e-5b3f-4a6d-9e2c-1f7a3b5d9c0e';
  const path = `/api/knowledge-spaces/${spaceId}/documents/search`;
  const service = {
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
