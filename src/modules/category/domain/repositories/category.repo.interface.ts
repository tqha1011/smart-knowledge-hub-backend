import { Result } from 'neverthrow';

export type CategoryData = {
  readonly id: number;
  readonly name: string;
};
export abstract class ICategoryRepository {
  abstract getCategoryIdByPublicId(
    publicId: string,
    knowledgeSpaceId: number,
  ): Promise<Result<CategoryData | null, Error>>;
}
