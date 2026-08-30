import {
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiCreatedResponse({
    description: 'Category created successfully',
    schema: {
      example: {
        message: 'Category created successfully',
        publicId: '6b1f2a4e-8c3d-4e2a-9f1b-3d5e7a9c1b2d',
        name: 'Onboarding',
      },
    },
  })
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
      ({ publicId, name }) => ({
        message: 'Category created successfully',
        publicId,
        name,
      }),
      (error: AppError) => {
        throw this.toHttpError(error, 'creating a category');
      },
    );
  }

  /**
   * Lists the categories defined in a knowledge space.
   * @remarks The caller must be at least an Editor of the knowledge space.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not at least an Editor of the knowledge space.
   * @throws {404} when the user or the knowledge space does not exist.
   * @throws {500} for any unexpected error while listing categories.
   * @example
   * GET /api/knowledge-spaces/6b1f.../categories
   */
  @ApiOperation({ summary: 'List categories in a knowledge space' })
  @ApiOkResponse({
    description: 'List of categories in the knowledge space',
    schema: {
      example: [
        {
          publicId: '6b1f2a4e-8c3d-4e2a-9f1b-3d5e7a9c1b2d',
          name: 'Onboarding',
        },
        {
          publicId: 'a1b2c3d4-e5f6-4789-9abc-def012345678',
          name: 'Policies',
        },
      ],
    },
  })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Get()
  async getCategoryList(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
  ) {
    const result = await this.categoryService.getCategoryList(
      user.sub,
      knowledgeSpacePublicId,
    );
    return result.match(
      (categories) => categories,
      (error: AppError) => {
        throw this.toHttpError(error, 'listing categories');
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
