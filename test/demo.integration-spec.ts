import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { PrismaClient } from 'generated/prisma/client';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { Server } from 'node:http';
import { DemoRepository } from 'src/modules/demo/infrastructure/demo.repo';
import { DemoService } from 'src/modules/demo/application/demo.service';
import { DemoController } from 'src/modules/demo/api/demo.controller';
import { DemoAccessGuard } from 'src/modules/demo/api/demo-access.guard';
import { demoOptions, nextUtcDay } from 'src/modules/demo/domain/demo-policy';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';

const url = process.env.DEMO_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.includes('demo_test_'))
  throw new Error(
    'DEMO_TEST_DATABASE_URL must point to a dedicated demo_test_ database',
  );
const pool = new Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const repo = new DemoRepository(prisma as unknown as PrismaService);
let config: ConfigService;
let options: ReturnType<typeof demoOptions>;
let spaceId: number;
let ownerId: number;
let categoryId: number;
let typeId: number;
let documentId: number;
let app: INestApplication<Server>;

@Controller('api/blocked')
class BlockedController {
  @Get() blocked() {
    return { secret: 'never visible to guests' };
  }
}

describe('demo persistence and HTTP on PostgreSQL', () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email: `${randomUUID()}@test.invalid`,
        username: 'Owner',
        password: 'unused',
      },
    });
    ownerId = owner.id;
    const type = await prisma.knowledgeSpaceType.create({
      data: { name: randomUUID() },
    });
    typeId = type.id;
    const space = await prisma.knowledgeSpace.create({
      data: { name: 'Demo fixture', typeId },
    });
    spaceId = space.id;
    const category = await prisma.category.create({
      data: { name: 'Fixture', knowledgeSpaceId: spaceId },
    });
    categoryId = category.id;
    const doc = await prisma.document.create({
      data: {
        title: 'Fixture.md',
        fileType: 'MD',
        fileSize: 1,
        status: 'Ready',
        storagePath: 'test-fixture',
        authorId: ownerId,
        categoryId,
        knowledgeSpaceId: spaceId,
        content: 'Fictional fixture',
      },
    });
    documentId = doc.id;
    config = new ConfigService({
      DEMO_ENABLED: 'true',
      JWT_SECRET: 'demo-integration-secret',
      DEMO_KNOWLEDGE_SPACE_PUBLIC_ID: space.publicId,
    });
    options = demoOptions(config);
    const module = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: 'demo-integration-secret' }),
        ThrottlerModule.forRoot([
          { name: 'limitPerMinute-auth', ttl: 60000, limit: 10 },
        ]),
      ],
      controllers: [DemoController, BlockedController],
      providers: [
        { provide: ConfigService, useValue: config },
        { provide: DemoRepository, useValue: repo },
        DemoService,
        { provide: APP_GUARD, useClass: DemoAccessGuard },
      ],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    await app.init();
  });
  beforeEach(async () => {
    await prisma.demoSession.updateMany({ data: { expiresAt: new Date(0) } });
    await repo.cleanup();
    await prisma.demoDailyUsage.deleteMany();
  });
  afterAll(async () => {
    if (app) await app.close();
    await prisma.demoSession.updateMany({ data: { expiresAt: new Date(0) } });
    await repo.cleanup();
    await prisma.demoDailyUsage.deleteMany();
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.knowledgeSpace.deleteMany({ where: { id: spaceId } });
    await prisma.knowledgeSpaceType.deleteMany({ where: { id: typeId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
    await pool.end();
  });
  const create = (ip = randomUUID()) =>
    repo.create(ip, 'unusable-password-hash', options);

  it('creates one Employee and Viewer atomically and never a refresh token', async () => {
    const session = await create();
    expect(session.user.role).toBe('Employee');
    expect(session.user.email).toMatch(/@demo.invalid$/);
    expect(
      await prisma.userWorkspace.findFirst({
        where: { userId: session.userId },
      }),
    ).toMatchObject({ role: 'Viewer', knowledgeSpaceId: spaceId });
    expect(
      await prisma.refreshToken.count({ where: { userId: session.userId } }),
    ).toBe(0);
  });
  it('does not leave an account behind when the configured space is missing', async () => {
    const before = await prisma.user.count();
    await expect(
      repo.create(randomUUID(), 'unused', {
        ...options,
        spacePublicId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(await prisma.user.count()).toBe(before);
  });
  it('serializes IP admission across concurrent requests and persists the hourly cap', async () => {
    const ip = randomUUID();
    const first = await Promise.allSettled(
      Array.from({ length: 6 }, () => create(ip)),
    );
    expect(first.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    await prisma.demoSession.updateMany({
      where: { ipHash: ip },
      data: { createdAt: new Date(Date.now() - 120000) },
    });
    const second = await Promise.allSettled(
      Array.from({ length: 4 }, () => create(ip)),
    );
    expect(second.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(await prisma.demoSession.count({ where: { ipHash: ip } })).toBe(5);
  });
  it('never exceeds twenty reservations even with thirty simultaneous requests', async () => {
    const session = await create();
    const reservations = await Promise.allSettled(
      Array.from({ length: 30 }, () =>
        repo.reserveQuestion(session.user.publicId, options),
      ),
    );
    expect(reservations.filter((r) => r.status === 'fulfilled')).toHaveLength(
      20,
    );
    expect(await repo.findByUser(session.user.publicId)).toMatchObject({
      questionCount: 20,
    });
    expect(await repo.dailyUsage()).toMatchObject({ questionCount: 20 });
  });
  it('reserves the final daily slot once across two clients and keeps the quota after reconstruction', async () => {
    const a = await create();
    const b = await create();
    const day = new Date(nextUtcDay().getTime() - 86400000);
    await prisma.demoDailyUsage.create({ data: { day, questionCount: 199 } });
    const result = await Promise.allSettled([
      repo.reserveQuestion(a.user.publicId, options),
      repo.reserveQuestion(b.user.publicId, options),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const restarted = new DemoRepository(prisma as unknown as PrismaService);
    expect(await restarted.dailyUsage()).toMatchObject({ questionCount: 200 });
    await expect(
      restarted.reserveQuestion(a.user.publicId, options),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(
      await prisma.demoSession.aggregate({ _sum: { questionCount: true } }),
    ).toMatchObject({ _sum: { questionCount: 1 } });
  });
  it('does not charge revoked or expired sessions, and yesterday does not consume today', async () => {
    const session = await create();
    const day = new Date(nextUtcDay().getTime() - 2 * 86400000);
    await prisma.demoDailyUsage.create({ data: { day, questionCount: 200 } });
    expect(await repo.reserveQuestion(session.user.publicId, options)).toBe(
      true,
    );
    await repo.revoke(session.user.publicId);
    await expect(
      repo.reserveQuestion(session.user.publicId, options),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await repo.dailyUsage()).toMatchObject({ questionCount: 1 });
  });
  it('cleans only expired demo identities and all chat dependencies, retaining daily usage and documents', async () => {
    const guest = await create();
    const active = await create();
    const chat = await prisma.chatSession.create({
      data: {
        userId: guest.userId,
        knowledgeSpaceId: spaceId,
        title: 'Fixture',
      },
    });
    const message = await prisma.chatMessage.create({
      data: { chatSessionId: chat.id, role: 'Assistant', content: 'Fixture' },
    });
    await prisma.answerSource.create({
      data: {
        messageId: message.id,
        documentId,
        knowledgeSpaceId: spaceId,
        score: 1,
      },
    });
    await prisma.feedback.create({
      data: {
        userId: guest.userId,
        messageId: message.id,
        comment: 'fixture',
        rating: 'Helpful',
      },
    });
    await prisma.unAnsweredQuestion.create({
      data: {
        userId: guest.userId,
        knowledgeSpaceId: spaceId,
        question: 'Fixture?',
        reason: 'fixture',
      },
    });
    await repo.reserveQuestion(guest.user.publicId, options);
    await prisma.demoSession.update({
      where: { id: guest.id },
      data: { expiresAt: new Date(Date.now() - 2 * 86400000) },
    });
    expect(await repo.cleanup()).toBe(1);
    expect(await repo.cleanup()).toBe(0);
    expect(
      await prisma.user.findUnique({ where: { id: guest.userId } }),
    ).toBeNull();
    expect(
      await prisma.user.findUnique({ where: { id: ownerId } }),
    ).not.toBeNull();
    expect(await repo.findByUser(active.user.publicId)).not.toBeNull();
    expect(
      await prisma.document.findUnique({ where: { id: documentId } }),
    ).toMatchObject({ status: 'Ready', content: 'Fictional fixture' });
    expect(
      await prisma.chatMessage.count({ where: { chatSessionId: chat.id } }),
    ).toBe(0);
    expect(await repo.dailyUsage()).toMatchObject({ questionCount: 1 });
  });
  it('exposes the real contract, blocks unannotated routes and revokes the JWT immediately', async () => {
    const publicConfig = await request(app.getHttpServer())
      .get('/api/auth/demo-config')
      .expect(200);
    expect(publicConfig.body).toMatchObject({
      enabled: true,
      durationSeconds: 3600,
      questionLimit: 20,
    });
    const entry = await request(app.getHttpServer())
      .post('/api/auth/demo-session')
      .expect(201);
    const body = entry.body as { refreshToken?: string; accessToken: string };
    expect(body.refreshToken).toBeUndefined();
    const token = body.accessToken;
    const jwt = app.get(JwtService);
    const claims = await jwt.verifyAsync<{
      type: string;
      exp: number;
      iat: number;
    }>(token);
    expect(claims.type).toBe('demo');
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(3600);
    await request(app.getHttpServer())
      .get('/api/auth/demo-session')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/blocked')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(app.getHttpServer())
      .delete('/api/auth/demo-session')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/auth/demo-session')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});
