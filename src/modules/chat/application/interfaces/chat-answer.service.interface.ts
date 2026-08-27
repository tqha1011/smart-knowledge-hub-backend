import { Result } from 'neverthrow';

export type ChatAnswerSource = {
  documentPublicId: string;
  documentId: number;
  documentTitle: string;
  chunkId: number;
  content: string;
  score: number;
};

export type ChatAnswer =
  | { answered: true; content: string; sources: ChatAnswerSource[] }
  | { answered: false; reason: string };

export abstract class IChatAnswerService {
  abstract generateAnswer(
    knowledgeSpaceId: number,
    userId: number,
    question: string,
  ): Promise<Result<ChatAnswer, Error>>;
}
