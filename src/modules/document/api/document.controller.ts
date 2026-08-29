import {
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { toHttpException } from 'src/shared/common/app-error.mapper';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { JwtAuthGuard } from 'src/shared/common/jwt.guard';
import type { JwtPayload } from 'src/shared/common/jwt.payload.interface';
import { PaginationQueryDto } from 'src/shared/common/pagination';
import { Roles } from 'src/shared/common/roles.decorator';
import { RolesGuard } from 'src/shared/common/roles.guard';
import { User } from 'src/shared/common/user.decorator';
import { SystemRole } from 'src/shared/domain/enum';
import {
  DocumentCreateRequestDto,
  DocumentUploadUrlRequestDto,
} from '../application/dtos/document.request.dto';
import { IDocumentService } from '../application/interfaces/document.service.interface';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('api/knowledge-spaces/:knowledgeSpacePublicId/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);
  constructor(private readonly documentService: IDocumentService) {}

  /**
   * Issues a short-lived URL the client uses to PUT the file straight to storage,
   * so the bytes never pass through this API.
   * @remarks Step 1 of a two-step upload: send the returned `storageKey` back with
   * `POST /documents` once the PUT succeeds. The URL expires in 5 minutes, and the
   * signature pins `fileSize`, so a differently sized body is rejected by storage.
   * @throws {400} when the file extension is not PDF, DOCX, TXT or MD.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not at least an Editor of the knowledge space.
   * @throws {500} for any unexpected error while signing the URL.
   * @example
   * POST /api/knowledge-spaces/6b1f.../documents/upload-url
   * {
   *   "fileName": "handbook.pdf",
   *   "contentType": "application/pdf",
   *   "fileSize": 248310
   * }
   */
  @ApiOperation({ summary: 'Get a presigned URL to upload a document file' })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Post('upload-url')
  async getUploadUrl(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Body() documentUploadUrlRequestDto: DocumentUploadUrlRequestDto,
  ) {
    const result = await this.documentService.getUploadUrlAsync(
      knowledgeSpacePublicId,
      user.sub,
      documentUploadUrlRequestDto,
    );
    return result.match(
      (uploadData) => {
        return uploadData;
      },
      (error: AppError) => {
        throw this.toHttpError(error, 'signing a document upload URL');
      },
    );
  }

  /**
   * Registers an already-uploaded file as a document in the knowledge space.
   * @remarks Step 2 of the upload: `storageKey` must be the one returned by
   * `POST /documents/upload-url`. The file size is read back from storage rather
   * than taken from the body, and the document starts in `Processing` until it has
   * been chunked and embedded.
   * @throws {400} when the storage key belongs to another knowledge space, no file
   * was uploaded under it, or the file extension is unsupported.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not at least an Editor of the knowledge space.
   * @throws {404} when the category or the authenticated user does not exist.
   * @throws {500} for any unexpected error while creating the document.
   * @example
   * POST /api/knowledge-spaces/6b1f.../documents
   * {
   *   "name": "handbook.pdf",
   *   "description": "Everything a new engineer needs",
   *   "categoryPublicId": "0f2a...",
   *   "storageKey": "documents/6b1f.../9c3e....pdf",
   *   "visibility": "Public"
   * }
   */
  @ApiOperation({ summary: 'Create a document from an uploaded file' })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Post()
  async createDocument(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Body() documentCreateRequestDto: DocumentCreateRequestDto,
  ) {
    const result = await this.documentService.createDocumentAsync(
      knowledgeSpacePublicId,
      user.sub,
      documentCreateRequestDto,
    );
    return result.match(
      (document) => {
        return document;
      },
      (error: AppError) => {
        throw this.toHttpError(error, 'creating a document');
      },
    );
  }

  /**
   * Returns a short-lived URL the browser can open to read the stored file.
   * @remarks The URL expires in 15 minutes and is not stored anywhere, so it has to
   * be requested again for each view. A `Restricted` document additionally requires
   * a `DocumentPermission` row for the caller.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not a member of the knowledge space, or lacks
   * permission on a restricted document.
   * @throws {404} when the document does not exist in this knowledge space.
   * @throws {500} for any unexpected error while signing the URL.
   * @example
   * GET /api/knowledge-spaces/6b1f.../documents/8d4c.../download-url
   * // { "downloadUrl": "https://....r2.cloudflarestorage.com/...?X-Amz-Signature=..." }
   */
  @ApiOperation({ summary: 'Get a presigned URL to read a document file' })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Get(':documentPublicId/download-url')
  async getDownloadUrl(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Param('documentPublicId', ParseUUIDPipe) documentPublicId: string,
  ) {
    const result = await this.documentService.getDownloadUrlAsync(
      knowledgeSpacePublicId,
      user.sub,
      documentPublicId,
    );
    return result.match(
      (downloadUrl) => {
        return { downloadUrl };
      },
      (error: AppError) => {
        throw this.toHttpError(error, 'signing a document download URL');
      },
    );
  }

  /**
   * Lists the documents in a knowledge space, newest first.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not a member of the knowledge space.
   * @throws {500} for any unexpected error while fetching the list.
   * @example
   * GET /api/knowledge-spaces/6b1f.../documents?pageNumber=1&pageSize=20
   */
  @ApiOperation({ summary: 'List documents in a knowledge space' })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Get()
  async getDocumentList(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Query(new ValidationPipe({ transform: true }))
    pagination: PaginationQueryDto,
  ) {
    const result = await this.documentService.getDocumentListAsync(
      knowledgeSpacePublicId,
      user.sub,
      pagination,
    );
    return result.match(
      (page) => page,
      (error: AppError) => {
        throw this.toHttpError(error, 'listing documents');
      },
    );
  }

  /**
   * Returns the full detail of a document, including its content.
   * @remarks A `Restricted` document additionally requires a `DocumentPermission`
   * row for the caller.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not a member of the knowledge space, or lacks
   * permission on a restricted document.
   * @throws {404} when the document does not exist in this knowledge space.
   * @throws {500} for any unexpected error while fetching the document.
   * @example
   * GET /api/knowledge-spaces/6b1f.../documents/8d4c...
   */
  @ApiOperation({ summary: 'Get a document detail' })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Get(':documentPublicId')
  async getDocumentDetail(
    @User() user: JwtPayload,
    @Param('knowledgeSpacePublicId', ParseUUIDPipe)
    knowledgeSpacePublicId: string,
    @Param('documentPublicId', ParseUUIDPipe) documentPublicId: string,
  ) {
    const result = await this.documentService.getDocumentDetailAsync(
      knowledgeSpacePublicId,
      user.sub,
      documentPublicId,
    );
    return result.match(
      (document) => document,
      (error: AppError) => {
        throw this.toHttpError(error, 'getting a document detail');
      },
    );
  }

  /**
   * Maps an `AppError` to its HTTP exception, logging the ones that indicate a
   * failure on our side rather than a bad request.
   */
  private toHttpError(error: AppError, action: string): HttpException {
    if (error.code === ErrorCode.InternalServerError) {
      this.logger.error(`Unexpected error while ${action}:`, error.stack);
    }
    return toHttpException(error);
  }
}
