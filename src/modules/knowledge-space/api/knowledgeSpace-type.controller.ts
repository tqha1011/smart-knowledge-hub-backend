import {
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
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
import { Roles } from 'src/shared/common/roles.decorator';
import { RolesGuard } from 'src/shared/common/roles.guard';
import { SystemRole } from 'src/shared/domain/enum';
import { AddKnowledgeSpaceTypeDto } from '../application/dtos/knowledgeSpace.request.dto';
import { IKnowledgeSpaceTypeService } from '../application/interfaces/knowledgeSpace-type.service.interface';

@ApiTags('knowledge-space-types')
@ApiBearerAuth()
@Controller('api/knowledge-spaces/types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KnowledgeSpaceTypeController {
  private readonly logger = new Logger(KnowledgeSpaceTypeController.name);
  constructor(
    private readonly knowledgeSpaceTypeService: IKnowledgeSpaceTypeService,
  ) {}

  /**
   * Lists every knowledge space type that can be referenced by `typePublicId`
   * when creating or updating a knowledge space.
   * @throws {401} when no valid bearer token is provided.
   * @throws {500} for any unexpected error while fetching the list.
   * @example
   * GET /api/knowledge-spaces/types
   */
  @ApiOperation({ summary: 'List knowledge space types' })
  @ApiOkResponse({
    description: 'List of knowledge space types',
    schema: {
      example: [
        {
          publicId: '0f2a1e3d-4b5c-4d6e-8f9a-0b1c2d3e4f5a',
          name: 'HANDBOOK',
        },
        {
          publicId: '6b1f2a4e-8c3d-4e2a-9f1b-3d5e7a9c1b2d',
          name: 'PROJECT',
        },
      ],
    },
  })
  @Roles([SystemRole.Admin])
  @Get()
  async getKnowledgeSpaceTypes() {
    const result = await this.knowledgeSpaceTypeService.getTypes();
    return result.match(
      (types) => types,
      (error: AppError) => {
        throw this.toHttpError(error, 'reading knowledge space types');
      },
    );
  }

  /**
   * Creates a new knowledge space type.
   * @throws {400} when the name is missing or too long.
   * @throws {401} when no valid bearer token is provided.
   * @throws {409} when a type with the same name already exists.
   * @throws {500} for any unexpected error while adding the type.
   * @example
   * POST /api/knowledge-spaces/types
   * { "name": "HANDBOOK" }
   */
  @ApiOperation({ summary: 'Add a new knowledge space type' })
  @ApiCreatedResponse({
    description: 'Knowledge space type added successfully',
    schema: {
      example: { message: 'Knowledge space type added successfully' },
    },
  })
  @Roles([SystemRole.Admin])
  @Post()
  async addNewKnowledgeSpaceType(
    @Body() addKnowledgeSpaceTypeDto: AddKnowledgeSpaceTypeDto,
  ) {
    const result = await this.knowledgeSpaceTypeService.addNewType(
      addKnowledgeSpaceTypeDto,
    );
    return result.match(
      () => ({ message: 'Knowledge space type added successfully' }),
      (error: AppError) => {
        throw this.toHttpError(error, 'adding a knowledge space type');
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
