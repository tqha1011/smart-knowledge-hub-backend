import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { authorizeMembership } from 'src/modules/knowledge-space/application/services/authorizeMembership';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { CacheKey } from 'src/shared/domain/cacheKey';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import {
  GetCategoryData,
  ICategoryRepository,
} from '../../domain/repositories/category.repo.interface';
import { CreateCategoryDto } from '../dtos/category.request.dto';
import { ICategoryService } from '../interfaces/category.service.interface';

const CATEGORY_LIST_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class CategoryService implements ICategoryService {
  private readonly logger = new Logger(CategoryService.name);
  constructor(
    private readonly categoryRepository: ICategoryRepository,
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
    private readonly cache: IApplicationCache,
  ) {}
  async getCategoryList(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<GetCategoryData[], AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Editor,
        'get category',
      );
      if (membership.isErr()) {
        return err(membership.error);
      }
      let cacheKey: string | undefined;
      try {
        const version =
          (await this.cache.get<string>(
            CacheKey.generateCategoryListVersionKey(
              membership.value.knowledgeSpaceId,
            ),
          )) ?? '0';
        cacheKey = CacheKey.generateCategoryListKey(
          membership.value.knowledgeSpaceId,
          version,
        );
        const cached = await this.cache.get<string>(cacheKey);
        if (cached !== undefined && cached !== null) {
          const categories = JSON.parse(cached) as GetCategoryData[];
          if (!Array.isArray(categories)) {
            throw new Error('Invalid cached category list');
          }
          return ok(categories);
        }
      } catch (error) {
        this.logger.warn('Failed to read category list cache', error);
      }
      const categories = await this.categoryRepository.getCategoryList(
        membership.value.knowledgeSpaceId,
      );
      if (categories.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get category list. ${categories.error.message}`,
          ),
        );
      }
      if (cacheKey !== undefined) {
        try {
          // Retain the version read before the query, including during invalidation.
          await this.cache.set(
            cacheKey,
            JSON.stringify(categories.value),
            CATEGORY_LIST_CACHE_TTL_MS,
          );
        } catch (error) {
          this.logger.warn('Failed to write category list cache', error);
        }
      }
      return ok(categories.value);
    } catch (error) {
      this.logger.error('Failed to get category list', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to get category list',
        ),
      );
    }
  }

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
