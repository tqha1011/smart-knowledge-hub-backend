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

  abstract getCategoryIdByName(
    name: string,
    knowledgeSpaceId: number,
  ): Promise<Result<number | null, Error>>;

  abstract createCategory(
    name: string,
    knowledgeSpaceId: number,
  ): Promise<Result<CategoryData, Error>>;
}
