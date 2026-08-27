import { Result } from 'neverthrow';

export type UnansweredQuestionInput = {
  question: string;
  reason: string;
  userId: number;
  knowledgeSpaceId: number;
};

export abstract class IUnansweredQuestionRepository {
  abstract addUnansweredQuestion(
    input: UnansweredQuestionInput,
  ): Promise<Result<undefined, Error>>;
}
