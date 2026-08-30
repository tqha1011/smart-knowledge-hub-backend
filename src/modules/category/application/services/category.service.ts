import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { authorizeMembership } from 'src/modules/knowledge-space/application/services/authorizeMembership';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { ICategoryRepository } from '../../domain/repositories/category.repo.interface';
import { CreateCategoryDto } from '../dtos/category.request.dto';
import { ICategoryService } from '../interfaces/category.service.interface';

@Injectable()
export class CategoryService implements ICategoryService {
  private readonly logger = new Logger(CategoryService.name);
  constructor(
    private readonly categoryRepository: ICategoryRepository,
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
  ) {}

  async createCategory(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    createCategoryDto: CreateCategoryDto,
  ): Promise<Result<{ publicId: string; name: string }, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Owner,
        'create category',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }

      const existingCategoryIdResult =
        await this.categoryRepository.getCategoryIdByName(
          createCategoryDto.name,
          membership.value.knowledgeSpaceId,
        );
      if (existingCategoryIdResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get category id by name. ${existingCategoryIdResult.error.message}`,
          ),
        );
      }
      if (existingCategoryIdResult.value !== null) {
        return err(
          new AppError(
            ErrorCode.Conflict,
            `Category ${createCategoryDto.name} already exists in this knowledge space`,
          ),
        );
      }

      const publicId = randomUUID();
      const createResult = await this.categoryRepository.createCategory(
        publicId,
        createCategoryDto.name,
        membership.value.knowledgeSpaceId,
      );
      if (createResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to create category. ${createResult.error.message}`,
          ),
        );
      }
      return ok({ publicId, name: createResult.value.name });
    } catch (error) {
      this.logger.error('Failed to create category', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to create category',
        ),
      );
    }
  }
}
