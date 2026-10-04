import { Prisma } from 'generated/prisma/client';
import { DocumentListResponseDto } from '../application/dtos/document.response.dto';
import {
  toDomainStatus,
  toDomainType,
  toDomainVisibility,
} from '../document.mapper';

export const documentListInclude = {
  category: { select: { publicId: true, name: true } },
  author: { select: { publicId: true, username: true, avatarUrl: true } },
  _count: { select: { answerSources: true } },
} satisfies Prisma.DocumentInclude;

export function documentListSnapshot(
  document: Prisma.DocumentGetPayload<{ include: typeof documentListInclude }>,
): DocumentListResponseDto {
  return {
    publicId: document.publicId,
    title: document.title,
    fileType: toDomainType(document.fileType),
    status: toDomainStatus(document.status),
    visibility: toDomainVisibility(document.visibility),
    lastUpdated: document.updatedAt,
    category: document.category,
    updatedBy: {
      publicId: document.author.publicId,
      name: document.author.username,
      avatarUrl: document.author.avatarUrl,
    },
    cited: document._count.answerSources,
  };
}

export async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const [row] = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`;
  return row.now;
}

export function nextDocumentVersion(previous: Date, now: Date): Date {
  return new Date(Math.max(previous.getTime() + 1, now.getTime()));
}

export async function lockStorageKey(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  // Shared by create and replace. hash collisions only serialize unrelated keys.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}
