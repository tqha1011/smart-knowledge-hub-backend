import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  CategoryData,
  CreatedCategoryData,
  GetCategoryData,
  ICategoryRepository,
} from '../domain/repositories/category.repo.interface';

@Injectable()
export class CategoryRepository implements ICategoryRepository {
  private readonly logger = new Logger(CategoryRepository.name);
  constructor(private readonly prismaService: PrismaService) {}
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
