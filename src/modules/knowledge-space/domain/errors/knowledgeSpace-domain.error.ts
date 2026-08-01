export enum KnowledgeSpaceDomainError {
  DescriptionTooLong = 'DescriptionTooLong',
  NameTooLong = 'NameTooLong',
  InvalidType = 'InvalidType',
}

export class KnowledgeSpaceDomainValidationError extends Error {
  constructor(
    public readonly error: KnowledgeSpaceDomainError,
    message: string,
  ) {
    super(message);
  }
}
