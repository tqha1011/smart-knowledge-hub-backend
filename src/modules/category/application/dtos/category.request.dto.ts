import { IsString, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  /**
   * @example 'Onboarding'
   */
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, {
    message: 'Name should not exceed 100 characters long',
  })
  name!: string;
}
