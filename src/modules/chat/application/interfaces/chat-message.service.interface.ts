import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { ChatMessageRequestDto } from '../dtos/chat-message.request.dto';
import { ChatMessageResponseDto } from '../dtos/chat-message.response.dto';
import { ChatCacheDiagnostics } from './chat-answer.service.interface';

export abstract class IChatMessageService {
  abstract chatAsync(
    userPublicId: string,
    request: ChatMessageRequestDto,
    diagnostics?: ChatCacheDiagnostics,
  ): Promise<Result<ChatMessageResponseDto, AppError>>;
}
