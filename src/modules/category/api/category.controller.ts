import {
  Body,
  Controller,
  HttpException,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { toHttpException } from 'src/shared/common/app-error.mapper';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { JwtAuthGuard } from 'src/shared/common/jwt.guard';
import type { JwtPayload } from 'src/shared/common/jwt.payload.interface';
import { Roles } from 'src/shared/common/roles.decorator';
import { RolesGuard } from 'src/shared/common/roles.guard';
import { User } from 'src/shared/common/user.decorator';
import { SystemRole } from 'src/shared/domain/enum';
import { CreateCategoryDto } from '../application/dtos/category.request.dto';
import { ICategoryService } from '../application/interfaces/category.service.interface';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('api/knowledge-spaces/:knowledgeSpacePublicId/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoryController {
  private readonly logger = new Logger(CategoryController.name);
  constructor(private readonly categoryService: ICategoryService) {}

  /**
   * Creates a category used to organize documents within a knowledge space.
   * @remarks Only the Owner of the knowledge space may create a category.
   * @throws {400} when the name is missing or too long.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not the Owner of the knowledge space.
   * @throws {404} when the user or the knowledge space does not exist.
   * @throws {409} when a category with the same name already exists in the space.
   * @throws {500} for any unexpected error while creating the category.
   * @example
   * POST /api/knowledge-spaces/6b1f.../categories
   * { "name": "Onboarding" }
   */
  @ApiOperation({ summary: 'Create a category in a knowledge space' })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Post()
  async createCategory(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Body() createCategoryDto: CreateCategoryDto,
  ) {
    const result = await this.categoryService.createCategory(
      user.sub,
      knowledgeSpacePublicId,
      createCategoryDto,
    );
    return result.match(
      () => ({ message: 'Category created successfully' }),
      (error: AppError) => {
        throw this.toHttpError(error, 'creating a category');
      },
    );
  }

  private toHttpError(error: AppError, action: string): HttpException {
    if (error.code === ErrorCode.InternalServerError) {
      this.logger.error(`Unexpected error while ${action}:`, error.stack);
    }
    return toHttpException(error);
  }
}
