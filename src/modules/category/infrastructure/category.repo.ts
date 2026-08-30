import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  CategoryData,
  ICategoryRepository,
} from '../domain/repositories/category.repo.interface';

@Injectable()
export class CategoryRepository implements ICategoryRepository {
  private readonly logger = new Logger(CategoryRepository.name);
  constructor(private readonly prismaService: PrismaService) {}

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
    name: string,
    knowledgeSpaceId: number,
  ): Promise<Result<CategoryData, Error>> {
    try {
      const category = await this.prismaService.category.create({
        data: { publicId: randomUUID(), name, knowledgeSpaceId },
        select: { id: true, name: true },
      });
      return ok({ id: category.id, name: category.name });
    } catch (error) {
      this.logger.error(`Failed to create category: ${error}`);
      return err(new Error(`Failed to create category`));
    }
  }
}
