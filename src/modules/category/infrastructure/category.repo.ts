import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { CacheKey } from 'src/shared/domain/cacheKey';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import {
  CategoryData,
  CreatedCategoryData,
  GetCategoryData,
  ICategoryRepository,
} from '../domain/repositories/category.repo.interface';

@Injectable()
export class CategoryRepository implements ICategoryRepository {
  private readonly logger = new Logger(CategoryRepository.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cache: IApplicationCache,
  ) {}
  async getCategoryList(
    knowledgeSpaceId: number,
  ): Promise<Result<GetCategoryData[], Error>> {
    try {
      const categories = await this.prismaService.category.findMany({
        where: { knowledgeSpaceId },
        select: { publicId: true, name: true },
      });
      return ok(categories as GetCategoryData[]);
    } catch (error) {
      this.logger.error(`Failed to get category list: ${error}`);
      return err(new Error(`Failed to get category list`));
    }
  }

  async getCategoryIdByPublicId(
    publicId: string,
    knowledgeSpaceId: number,
  ): Promise<Result<CategoryData | null, Error>> {
    try {
      const category = await this.prismaService.category.findFirst({
        where: { publicId, knowledgeSpaceId },
        select: { id: true, name: true },
      });
      if (!category) {
        return ok(null);
      }
      return ok({ id: category.id, name: category.name });
    } catch (error) {
      this.logger.error(`Failed to get category ID by public ID: ${error}`);
      return err(new Error(`Failed to get category ID by public ID`));
    }
  }

  async getCategoryIdByName(
    name: string,
    knowledgeSpaceId: number,
  ): Promise<Result<number | null, Error>> {
    try {
      const category = await this.prismaService.category.findFirst({
        where: { name, knowledgeSpaceId },
        select: { id: true },
      });
      return ok(category?.id ?? null);
    } catch (error) {
      this.logger.error(`Failed to get category ID by name: ${error}`);
      return err(new Error(`Failed to get category ID by name`));
    }
  }

  async createCategory(
    publicId: string,
    name: string,
    knowledgeSpaceId: number,
  ): Promise<Result<CreatedCategoryData, Error>> {
    try {
      const category = await this.prismaService.category.create({
        data: { publicId, name, knowledgeSpaceId },
        select: { id: true, name: true, publicId: true },
      });
      // The FAQ flow also creates categories directly through this repository.
      const versionKey =
        CacheKey.generateCategoryListVersionKey(knowledgeSpaceId);
      let previousVersion: string | undefined;
      try {
        previousVersion = (await this.cache.get<string>(versionKey)) ?? '0';
      } catch (error) {
        this.logger.warn(
          'Failed to read category list cache version for invalidation',
          error,
        );
      }
      try {
        try {
          await this.cache.set(versionKey, randomUUID(), 0);
        } finally {
          if (previousVersion !== undefined) {
            await this.cache.delete(
              CacheKey.generateCategoryListKey(
                knowledgeSpaceId,
                previousVersion,
              ),
            );
          }
        }
      } catch (error) {
        this.logger.warn('Failed to invalidate category list cache', error);
      }
      return ok({
        id: category.id,
        name: category.name,
        publicId: category.publicId,
      });
    } catch (error) {
      this.logger.error(`Failed to create category: ${error}`);
      return err(new Error(`Failed to create category`));
    }
  }
}
