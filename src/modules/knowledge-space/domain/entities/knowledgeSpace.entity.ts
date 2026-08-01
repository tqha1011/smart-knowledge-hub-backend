import { UUID } from 'crypto';
import { Result, err, ok } from 'neverthrow';
import { KnowledgeSpaceType } from 'src/shared/domain/enum';
import {
  KnowledgeSpaceDomainError,
  KnowledgeSpaceDomainValidationError,
} from '../errors/knowledgeSpace-domain.error';

export type KnowledgeSpaceGetParams = {
  readonly id: number;
  readonly publicId: UUID;
  readonly name: string;
  readonly description: string;
  readonly createdAt: Date;
  readonly type: KnowledgeSpaceType;
  updatedAt: Date;
};

export type KnowledgeSpaceCreateParams = Omit<
  KnowledgeSpaceGetParams,
  'id' | 'publicId' | 'createdAt' | 'updatedAt'
>;

export class KnowledgeSpace {
  private constructor(private params: KnowledgeSpaceGetParams) {}

  static create(
    params: KnowledgeSpaceCreateParams,
  ): Result<KnowledgeSpace, KnowledgeSpaceDomainValidationError> {
    const validationResult = validateInformation(params);
    if (validationResult.isErr()) {
      return err(validationResult.error);
    }

    const knowledgeSpaceGetParams: KnowledgeSpaceGetParams = {
      id: 0, // This should be set by the database upon creation
      publicId: crypto.randomUUID(),
      name: params.name,
      description: params.description,
      type: params.type,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return ok(new KnowledgeSpace(knowledgeSpaceGetParams));
  }

  static getKnowledgeSpace(params: KnowledgeSpaceGetParams): KnowledgeSpace {
    return new KnowledgeSpace(params);
  }

  get id(): number {
    return this.params.id;
  }

  get publicId(): UUID {
    return this.params.publicId;
  }

  get name(): string {
    return this.params.name;
  }

  get description(): string {
    return this.params.description;
  }

  get type(): KnowledgeSpaceType {
    return this.params.type;
  }

  get createdAt(): Date {
    return this.params.createdAt;
  }

  get updatedAt(): Date {
    return this.params.updatedAt;
  }
}

function validateInformation(
  params: KnowledgeSpaceCreateParams,
): Result<undefined, KnowledgeSpaceDomainValidationError> {
  if (params.name.length > 100) {
    return err(
      new KnowledgeSpaceDomainValidationError(
        KnowledgeSpaceDomainError.NameTooLong,
        'The name of the knowledge space is too long. It should not exceed 100 characters.',
      ),
    );
  }

  if (params.description.length > 500) {
    return err(
      new KnowledgeSpaceDomainValidationError(
        KnowledgeSpaceDomainError.DescriptionTooLong,
        'The description of the knowledge space is too long. It should not exceed 500 characters.',
      ),
    );
  }

  if (!Object.values(KnowledgeSpaceType).includes(params.type)) {
    return err(
      new KnowledgeSpaceDomainValidationError(
        KnowledgeSpaceDomainError.InvalidType,
        'The type of the knowledge space is invalid. It should be one of the predefined types.',
      ),
    );
  }
  return ok(undefined);
}
