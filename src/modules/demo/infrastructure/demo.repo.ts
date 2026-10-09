import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { demoOptions, isDemoActive, nextUtcDay } from '../domain/demo-policy';

type Options = ReturnType<typeof demoOptions>;
export type DemoIdentity = Prisma.DemoSessionGetPayload<{
  include: { user: true; knowledgeSpace: true };
}>;

@Injectable()
export class DemoRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(publicId: string) {
    return this.prisma.demoSession.findFirst({
      where: { user: { publicId } },
      include: { user: true, knowledgeSpace: true },
    });
  }

  async spaceExists(publicId: string) {
    return (
      (await this.prisma.knowledgeSpace.count({ where: { publicId } })) > 0
    );
  }

  async create(ipHash: string, password: string, options: Options) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${ipHash}, 0))`;
        const now = new Date();
        const recent = await tx.demoSession.findMany({
          where: {
            ipHash,
            createdAt: { gt: new Date(now.getTime() - 3600000) },
          },
          select: { createdAt: true },
        });
        if (
          recent.length >= 5 ||
          recent.filter((s) => s.createdAt.getTime() > now.getTime() - 60000)
            .length >= 3
        )
          throw new AppError(
            ErrorCode.TooManyRequests,
            'Too many demo sessions. Try again later.',
          );
        const space = await tx.knowledgeSpace.findUnique({
          where: { publicId: options.spacePublicId },
          select: { id: true },
        });
        if (!space)
          throw new AppError(
            ErrorCode.ServiceUnavailable,
            'Demo documents are not available.',
          );
        const { randomUUID } = await import('node:crypto');
        const user = await tx.user.create({
          data: {
            username: 'Demo guest',
            email: `${randomUUID()}@demo.invalid`,
            password,
            role: 'Employee',
          },
        });
        await tx.userWorkspace.create({
          data: { userId: user.id, knowledgeSpaceId: space.id, role: 'Viewer' },
        });
        return tx.demoSession.create({
          data: {
            userId: user.id,
            knowledgeSpaceId: space.id,
            ipHash,
            expiresAt: new Date(now.getTime() + options.durationSeconds * 1000),
          },
          include: { user: true, knowledgeSpace: true },
        });
      },
      { timeout: 15000 },
    );
  }

  async reserveQuestion(userPublicId: string, options: Options) {
    return this.prisma.$transaction(
      async (tx) => {
        const session = await tx.demoSession.findFirst({
          where: { user: { publicId: userPublicId } },
          include: { knowledgeSpace: true },
        });
        if (!session) return false;
        if (
          !options.enabled ||
          !isDemoActive(session) ||
          session.knowledgeSpace.publicId !== options.spacePublicId
        )
          throw new AppError(ErrorCode.Unauthorized, 'Demo session expired.');
        const day = new Date(nextUtcDay().getTime() - 86400000);
        await tx.demoDailyUsage.upsert({
          where: { day },
          create: { day },
          update: {},
        });
        const daily = await tx.demoDailyUsage.updateMany({
          where: { day, questionCount: { lt: options.dailyQuestionLimit } },
          data: { questionCount: { increment: 1 } },
        });
        if (!daily.count)
          throw new AppError(
            ErrorCode.TooManyRequests,
            'The daily demo question limit has been reached. You can still browse documents.',
          );
        const reserved = await tx.demoSession.updateMany({
          where: {
            id: session.id,
            expiresAt: { gt: new Date() },
            revokedAt: null,
            questionCount: { lt: options.questionLimit },
          },
          data: { questionCount: { increment: 1 } },
        });
        if (!reserved.count) {
          const current = await tx.demoSession.findUnique({
            where: { id: session.id },
          });
          if (!current || !isDemoActive(current))
            throw new AppError(ErrorCode.Unauthorized, 'Demo session expired.');
          throw new AppError(
            ErrorCode.TooManyRequests,
            'Your demo question limit has been reached.',
          );
        }
        return true;
      },
      { maxWait: 15000, timeout: 15000 },
    );
  }

  dailyUsage(day = new Date(nextUtcDay().getTime() - 86400000)) {
    return this.prisma.demoDailyUsage.findUnique({ where: { day } });
  }

  async revoke(userPublicId: string) {
    await this.prisma.demoSession.updateMany({
      where: { user: { publicId: userPublicId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async cleanup(now = new Date()) {
    const cutoff = new Date(now.getTime() - 86400000);
    const purged = await this.prisma.$transaction(
      async (tx) => {
        const expired = await tx.demoSession.findMany({
          where: {
            OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
          },
          select: { userId: true },
          take: 100,
          orderBy: { id: 'asc' },
        });
        const ids = expired.map((s) => s.userId);
        if (!ids.length) return 0;
        if (await tx.document.count({ where: { authorId: { in: ids } } }))
          throw new Error('Refusing to clean demo users that own documents');
        const sessionFilter = { userId: { in: ids } };
        await tx.feedback.deleteMany({
          where: {
            OR: [
              { userId: { in: ids } },
              { message: { chatSession: sessionFilter } },
            ],
          },
        });
        await tx.answerSource.deleteMany({
          where: { message: { chatSession: sessionFilter } },
        });
        await tx.chatMessage.deleteMany({
          where: { chatSession: sessionFilter },
        });
        await tx.chatSession.deleteMany({ where: sessionFilter });
        await tx.unAnsweredQuestion.deleteMany({
          where: { userId: { in: ids } },
        });
        await tx.documentPermission.deleteMany({
          where: { userId: { in: ids } },
        });
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.userWorkspace.deleteMany({ where: { userId: { in: ids } } });
        await tx.demoSession.deleteMany({ where: { userId: { in: ids } } });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
        return ids.length;
      },
      { timeout: 15000 },
    );
    await this.prisma.demoDailyUsage.deleteMany({
      where: { day: { lt: new Date(now.getTime() - 30 * 86400000) } },
    });
    return purged;
  }
}
