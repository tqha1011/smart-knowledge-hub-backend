import { IsString, MaxLength } from 'class-validator';

export class ResolveUnansweredQuestionRequestDto {
  /**
   * @example 'Parental leave is 6 months, see the HR policies handbook.'
   */
  @IsString({ message: 'Answer must be a string' })
  @MaxLength(2000, {
    message: 'Answer should not exceed 2000 characters long',
  })
  answer!: string;
}
