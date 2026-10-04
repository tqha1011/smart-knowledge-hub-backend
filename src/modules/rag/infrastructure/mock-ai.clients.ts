import { ok } from 'neverthrow';
import { IAnswerGenerationClient } from '../domain/repositories/answer-generation-client.interface';
import { IEmbeddingClient } from '../domain/repositories/embedding-client.interface';

// A nonzero vector makes cosine distance well-defined for pgvector queries.
const MOCK_VECTOR = Array.from({ length: 1536 }, (_, index) =>
  index === 0 ? 1 : 0,
);

export class MockEmbeddingClient implements IEmbeddingClient {
  generateEmbeddings(texts: string[]) {
    return Promise.resolve(ok(texts.map(() => [...MOCK_VECTOR])));
  }
}

export class MockAnswerGenerationClient implements IAnswerGenerationClient {
  generateAnswer() {
    return Promise.resolve(ok('Load test answer.'));
  }

  generateSessionTitle() {
    return Promise.resolve(ok('Load test chat'));
  }
}
