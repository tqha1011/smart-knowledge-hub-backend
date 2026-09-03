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

  /**
   * Resolves `false` (instead of an err) when no question matches the given
   * public ID within that knowledge space, so callers can distinguish a
   * not-found/wrong-scope case from an actual failure.
   */
  abstract markResolveQuestion(
    knowledgeSpaceId: number,
    questionPublicId: string,
  ): Promise<Result<boolean, Error>>;

  /** Resolves `null` when the question does not exist, is out of scope, or is
   * already resolved — callers can distinguish that from an actual failure. */
  abstract getUnresolvedQuestion(
    knowledgeSpaceId: number,
    questionPublicId: string,
  ): Promise<Result<{ question: string } | null, Error>>;
}
