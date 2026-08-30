import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { CreateCategoryDto } from '../dtos/category.request.dto';
import { GetCategoryData } from '../../domain/repositories/category.repo.interface';

export abstract class ICategoryService {
  abstract createCategory(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    createCategoryDto: CreateCategoryDto,
  ): Promise<Result<{ publicId: string; name: string }, AppError>>;

  abstract getCategoryList(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<GetCategoryData[], AppError>>;
}
