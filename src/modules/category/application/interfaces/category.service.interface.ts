import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { CreateCategoryDto } from '../dtos/category.request.dto';

export abstract class ICategoryService {
  abstract createCategory(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    createCategoryDto: CreateCategoryDto,
  ): Promise<Result<{ publicId: string; name: string }, AppError>>;
}
