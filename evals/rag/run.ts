import 'reflect-metadata';
import { config } from 'dotenv';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ChatAnswerService } from '../../src/modules/chat/application/services/chat-answer.service';
import { authorizeMembership } from '../../src/modules/knowledge-space/application/services/authorizeMembership';
import { KnowledgeSpaceRepository } from '../../src/modules/knowledge-space/infrastructure/knowledgeSpace.repo';
import { DocumentChunkRepository } from '../../src/modules/rag/infrastructure/document-chunk.repo';
import { GeminiEmbeddingClient } from '../../src/modules/rag/infrastructure/gemini-embedding.client';
import { GroqChatClient } from '../../src/modules/rag/infrastructure/groq-chat.client';
import { KnowledgeSpaceRole } from '../../src/shared/domain/enum';
import type { IApplicationCache } from '../../src/shared/infrastructure/cache/cache-manager.interface';
import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';

type Question = {
  id: string;
  knowledgeSpacePublicId: string;
  question: string;
  evidence: {
    documentPublicId: string;
    chunkIndex: number;
    quote: string;
  }[];
};

async function main() {
  config({ quiet: true });
  Logger.overrideLogger(['error', 'warn']);
  const { values } = parseArgs({
    options: {
      user: { type: 'string' },
      dataset: { type: 'string' },
      limit: { type: 'string', default: '1' },
      out: { type: 'string' },
    },
  });
  const userPublicId = values.user ?? process.env.BENCHMARK_USER_PUBLIC_ID;
  if (!userPublicId) throw new Error('Provide --user <userPublicId>.');
  const datasetPath = resolve(
    values.dataset ?? resolve(__dirname, 'pilot-10.jsonl'),
  );
  const dataset = readFileSync(datasetPath, 'utf8');
  const allQuestions = dataset
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Question);
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > allQuestions.length)
    throw new Error(
      `--limit must be an integer from 1 to ${allQuestions.length}.`,
    );
  const questions = allQuestions.slice(0, limit);
  const startedAt = new Date().toISOString();
  const output = resolve(
    values.out ??
      resolve(__dirname, 'results', `${startedAt.replace(/[:.]/g, '-')}.csv`),
  );
  const rawOutput = output.replace(/\.csv$/, '') + '.answers.jsonl';
  const metadataOutput = output.replace(/\.csv$/, '') + '.meta.json';
  if (!output.endsWith('.csv')) throw new Error('--out must end in .csv.');
  const configService = new ConfigService();
  configService.getOrThrow<string>('GEMINI_API_KEY');
  configService.getOrThrow<string>('GROQ_API_KEY');
  const embeddingModel = configService.getOrThrow<string>(
    'GEMINI_EMBEDDING_MODEL',
  );
  const prisma = new PrismaService();
  try {
    await prisma.onModuleInit();
    const spaces = new KnowledgeSpaceRepository(prisma);
    const memberships = new Map<
      string,
      { userId: number; knowledgeSpaceId: number }
    >();
    // Check membership and frozen evidence before spending any LLM quota.
    for (const question of questions) {
      const member = authorizeMembership(
        await spaces.getMembershipInKnowledgeSpace(
          userPublicId,
          question.knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Viewer,
        'benchmark chat in this knowledge space',
      );
      if (member.isErr()) throw new Error(member.error.message);
      memberships.set(question.knowledgeSpacePublicId, member.value);
      for (const evidence of question.evidence) {
        const chunk = await prisma.documentChunk.findFirst({
          where: {
            chunkIndex: evidence.chunkIndex,
            knowledgeSpaceId: member.value.knowledgeSpaceId,
            document: {
              publicId: evidence.documentPublicId,
              isDeleted: false,
              status: 'Ready',
              OR: [
                { visibility: 'Public' },
                {
                  documentPermissions: {
                    some: { userId: member.value.userId },
                  },
                },
              ],
            },
          },
          select: { contentChunk: true },
        });
        if (!chunk?.contentChunk.includes(evidence.quote))
          throw new Error(
            `${question.id}: source evidence is missing, changed, or inaccessible.`,
          );
      }
    }

    // Force real AI clients; isolated cold retrieval avoids shared mock caches.
    const cache: IApplicationCache = {
      get: async () => undefined,
      set: async () => {},
      delete: async () => {},
    };
    const service = new ChatAnswerService(
      new GeminiEmbeddingClient(configService),
      new DocumentChunkRepository(prisma),
      new GroqChatClient(configService),
      configService,
      cache,
    );
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, 'id,actualAnswer,verdict,reason\n', { flag: 'wx' });
    writeFileSync(rawOutput, '', { flag: 'wx' });
    writeFileSync(
      metadataOutput,
      JSON.stringify(
        {
          startedAt,
          userPublicId,
          questionIds: questions.map((question) => question.id),
          datasetPath: relative(resolve(__dirname, '../..'), datasetPath),
          datasetSha256: createHash('sha256').update(dataset).digest('hex'),
          gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf8',
          }).trim(),
          mode: 'ChatAnswerService',
          embeddingModel,
          answerClient: 'GroqChatClient',
          aiMock: false,
          cache: 'disabled',
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );

    const csv = (value: string) => '"' + value.replaceAll('"', '""') + '"';
    for (const question of questions) {
      const member = memberships.get(question.knowledgeSpacePublicId)!;
      const result = await service.generateAnswer(
        member.knowledgeSpaceId,
        member.userId,
        question.question,
      );
      if (result.isErr()) {
        appendFileSync(
          output,
          [question.id, '', 'ERROR', result.error.message].map(csv).join(',') +
            '\n',
        );
        appendFileSync(
          rawOutput,
          JSON.stringify({ id: question.id, error: result.error.message }) +
            '\n',
        );
        throw new Error(
          `${question.id}: pipeline failed; stopped without retrying.`,
        );
      }
      const answer = result.value;
      const actualAnswer = answer.answered ? answer.content : answer.reason;
      appendFileSync(
        output,
        [question.id, actualAnswer, '', ''].map(csv).join(',') + '\n',
      );
      appendFileSync(
        rawOutput,
        JSON.stringify({
          id: question.id,
          question: question.question,
          ...answer,
        }) + '\n',
      );
      console.log(
        `${question.id}: saved (${answer.answered ? answer.sources.length : 0} sources)`,
      );
      if (question !== questions.at(-1))
        await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
    console.log(`CSV for manual grading: ${output}`);
  } finally {
    await prisma.onModuleDestroy();
  }
}

void main().catch(() => {
  // Do not print connection errors, API keys, or request headers.
  console.error(
    'Benchmark stopped. Check configuration, membership, and the result files for errors.',
  );
  process.exitCode = 1;
});
