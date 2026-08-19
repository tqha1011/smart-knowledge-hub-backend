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
import { AddDocumentPermissionRequestDto } from '../application/dtos/document.request.dto';
import { IDocumentPermissionService } from '../application/interfaces/document-permission.service.interface';

@ApiTags('documents')
@ApiBearerAuth()
@Controller(
  'api/knowledge-spaces/:knowledgeSpacePublicId/documents/:documentPublicId/permissions',
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentPermissionController {
  private readonly logger = new Logger(DocumentPermissionController.name);
  constructor(
    private readonly documentPermissionService: IDocumentPermissionService,
  ) {}

  /**
   * Grants Read/Edit/Manage permission on a document to one or more users.
   * @remarks Only meaningful for `Restricted` documents — `Public` documents are
   * already readable by every knowledge-space member regardless of these rows.
   * @throws {400} when a `userPublicId` is not a valid UUID.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not at least an Editor of the knowledge space.
   * @throws {404} when the document does not exist, or a `userPublicId` does not
   * resolve to any user.
   * @throws {500} for any unexpected error while granting permissions.
   * @example
   * POST /api/knowledge-spaces/6b1f.../documents/8d4c.../permissions
   * { "permissions": [{ "userPublicId": "0f2a...", "permission": "Read" }] }
   */
  @ApiOperation({ summary: 'Grant document permissions to users' })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Post()
  async addDocumentPermission(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Param('documentPublicId', ParseUUIDPipe) documentPublicId: string,
    @Body() addDocumentPermissionRequestDto: AddDocumentPermissionRequestDto,
  ) {
    const result =
      await this.documentPermissionService.addDocumentPermissionAsync(
        knowledgeSpacePublicId,
        user.sub,
        documentPublicId,
        addDocumentPermissionRequestDto.permissions,
      );
    return result.match(
      () => ({ success: true }),
      (error: AppError) => {
        throw this.toHttpError(error, 'granting document permissions');
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
