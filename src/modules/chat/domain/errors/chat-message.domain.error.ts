export enum ChatMessageDomainError {
  ContentTooLong = 'ContentTooLong',
  InvalidRole = 'InvalidRole',
}

export class ChatMessageDomainErrorValidation extends Error {
  constructor(
    public readonly error: ChatMessageDomainError,
    message: string,
  ) {
    super(message);
  }
}
