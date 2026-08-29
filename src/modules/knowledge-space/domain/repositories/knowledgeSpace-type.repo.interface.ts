import { Result } from 'neverthrow';

export type TypeData = {
  publicId: string;
  name: string;
};
export abstract class IKnowledgeSpaceTypeRepository {
  abstract addNewType(name: string): Promise<Result<TypeData, Error>>;

  abstract getTypes(): Promise<Result<TypeData[], Error>>;

  abstract getTypeIdByName(name: string): Promise<Result<number | null, Error>>;
}
