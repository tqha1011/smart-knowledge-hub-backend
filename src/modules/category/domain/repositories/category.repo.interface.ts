import { Result } from 'neverthrow';

export type CategoryData = {
  readonly id: number;
  readonly name: string;
};

export type CreatedCategoryData = CategoryData & {
  readonly publicId: string;
};

export type GetCategoryData = {
  publicId: string;
  name: string;
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
    publicId: string,
    name: string,
    knowledgeSpaceId: number,
  ): Promise<Result<CreatedCategoryData, Error>>;

  abstract getCategoryList(
    knowledgeSpaceId: number,
  ): Promise<Result<GetCategoryData[], Error>>;
}
