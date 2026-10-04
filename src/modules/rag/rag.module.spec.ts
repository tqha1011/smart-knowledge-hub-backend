import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { IAnswerGenerationClient } from './domain/repositories/answer-generation-client.interface';
import { IEmbeddingClient } from './domain/repositories/embedding-client.interface';
import { GeminiEmbeddingClient } from './infrastructure/gemini-embedding.client';
import { GroqChatClient } from './infrastructure/groq-chat.client';
import { RagModule } from './rag.module';

type ClientProvider = {
  provide: unknown;
  useFactory?: (config: ConfigService) => unknown;
};

function getClientProvider(token: unknown): ClientProvider {
  const providers = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    RagModule,
  ) as ClientProvider[];
  const provider = providers.find((candidate) => candidate.provide === token);
  if (!provider) throw new Error('AI client provider is missing');
  return provider;
}

describe('RagModule AI providers', () => {
  it('uses deterministic mock embeddings without a Gemini key when enabled', async () => {
    const config = {
      get: () => 'true',
      getOrThrow: () => {
        throw new Error('Gemini key must not be read');
      },
    } as unknown as ConfigService;
    const provider = getClientProvider(IEmbeddingClient);
    expect(provider.useFactory).toBeDefined();

    const client = provider.useFactory!(config) as IEmbeddingClient;
    const documents = await client.generateEmbeddings([
      'Public guide',
      'Restricted guide',
    ]);
    const query = await client.generateEmbeddings(
      ['Where is the guide?'],
      'RETRIEVAL_QUERY',
    );
    expect(documents.isOk()).toBe(true);
    expect(query.isOk()).toBe(true);
    if (documents.isErr() || query.isErr()) return;
    expect(documents.value).toHaveLength(2);
    expect(documents.value[0]).toHaveLength(1536);
    expect(documents.value[0].every(Number.isFinite)).toBe(true);
    expect(documents.value[0].some((value) => value !== 0)).toBe(true);
    expect(documents.value[0]).toEqual(documents.value[1]);
    expect(query.value[0]).toEqual(documents.value[0]);
  });

  it('uses a mock answer and title without a Groq key when enabled', async () => {
    const config = {
      get: () => 'true',
      getOrThrow: () => {
        throw new Error('Groq key must not be read');
      },
    } as unknown as ConfigService;
    const provider = getClientProvider(IAnswerGenerationClient);
    expect(provider.useFactory).toBeDefined();

    const client = provider.useFactory!(config) as IAnswerGenerationClient;
    const answer = await client.generateAnswer('Question?', [
      { documentTitle: 'Guide', content: 'Answer' },
    ]);
    const title = await client.generateSessionTitle('Question?');
    expect(answer.isOk()).toBe(true);
    expect(title.isOk()).toBe(true);
    if (answer.isErr() || title.isErr()) return;
    expect(answer.value.length).toBeGreaterThan(0);
    expect(title.value.length).toBeGreaterThan(0);
  });

  it('keeps Gemini and Groq clients when mock mode is off', () => {
    const config = {
      get: () => undefined,
      getOrThrow: (name: string) => `${name}-test-key`,
    } as unknown as ConfigService;
    const embeddingProvider = getClientProvider(IEmbeddingClient);
    const answerProvider = getClientProvider(IAnswerGenerationClient);
    expect(embeddingProvider.useFactory).toBeDefined();
    expect(answerProvider.useFactory).toBeDefined();

    expect(embeddingProvider.useFactory!(config)).toBeInstanceOf(
      GeminiEmbeddingClient,
    );
    expect(answerProvider.useFactory!(config)).toBeInstanceOf(GroqChatClient);
  });
});
