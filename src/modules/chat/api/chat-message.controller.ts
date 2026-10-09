import { AllowDemo } from 'src/modules/demo/api/demo-access.decorator';
import {
  Body,
  Controller,
  HttpException,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { toHttpException } from 'src/shared/common/app-error.mapper';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { JwtAuthGuard } from 'src/shared/common/jwt.guard';
import type { JwtPayload } from 'src/shared/common/jwt.payload.interface';
import { Roles } from 'src/shared/common/roles.decorator';
import { RolesGuard } from 'src/shared/common/roles.guard';
import { User } from 'src/shared/common/user.decorator';
import { SystemRole } from 'src/shared/domain/enum';
import { ChatMessageRequestDto } from '../application/dtos/chat-message.request.dto';
import { ChatCacheDiagnostics } from '../application/interfaces/chat-answer.service.interface';
import { IChatMessageService } from '../application/interfaces/chat-message.service.interface';

@ApiTags('chat-messages')
@ApiBearerAuth()
@Controller('api/chat-messages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatMessageController {
  private readonly logger = new Logger(ChatMessageController.name);
  constructor(
    private readonly chatMessageService: IChatMessageService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Sends a user question to a chat session and returns the assistant's
   * answer in one response (non-streaming).
   * @throws {400} when the message content fails validation.
   * @throws {401} when no valid bearer token is provided.
   * @throws {403} when the caller is not at least a Viewer of the knowledge space.
   * @throws {404} when the knowledge space or chat session does not exist.
   * @throws {500} for any unexpected error while generating the answer.
   * @example
   * POST /api/chat-messages
   * {
   *   "knowledgeSpacePublicId": "6b1f...",
   *   "chatSessionPublicId": "8d4c...",
   *   "content": "How do I request PTO?"
   * }
   */
  @ApiOperation({ summary: 'Send a chat message and get the assistant answer' })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @AllowDemo('chat')
  @Post()
  async chat(
    @User() user: JwtPayload,
    @Body() chatMessageRequestDto: ChatMessageRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const diagnostics: ChatCacheDiagnostics | undefined =
      this.configService.get<string>('LOAD_TEST_CACHE_HEADERS') === 'true'
        ? {}
        : undefined;
    const result = await this.chatMessageService.chatAsync(
      user.sub,
      chatMessageRequestDto,
      diagnostics,
    );
    if (diagnostics?.embedding) {
      response.setHeader('X-Chat-Cache-Embedding', diagnostics.embedding);
    }
    if (diagnostics?.publicChunks) {
      response.setHeader('X-Chat-Cache-Public', diagnostics.publicChunks);
    }
    if (diagnostics?.restrictedChunks) {
      response.setHeader(
        'X-Chat-Cache-Restricted',
        diagnostics.restrictedChunks,
      );
    }
    return result.match(
      (message) => message,
      (error: AppError) => {
        throw this.toHttpError(error, 'processing a chat message');
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
