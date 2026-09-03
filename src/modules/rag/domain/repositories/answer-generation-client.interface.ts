import { Result } from 'neverthrow';

export type AnswerContextChunk = {
  documentTitle: string;
  content: string;
};

export abstract class IAnswerGenerationClient {
  abstract generateAnswer(
    question: string,
    context: AnswerContextChunk[],
  ): Promise<Result<string, Error>>;

  abstract generateSessionTitle(
    messages: string,
  ): Promise<Result<string, Error>>;
}
