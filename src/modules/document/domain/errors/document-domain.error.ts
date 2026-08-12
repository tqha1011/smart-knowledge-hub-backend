export enum DocumentDomainError {
  TitleTooLong = 'TitleTooLong',
  DescriptionTooLong = 'DescriptionTooLong',
}

export class DocumentDomainErrorValidation extends Error {
  constructor(
    public readonly error: DocumentDomainError,
    message: string,
  ) {
    super(message);
  }
}
