import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { ChatMessageRequestDto } from '../dtos/chat-message.request.dto';
import { ChatMessageResponseDto } from '../dtos/chat-message.response.dto';

export abstract class IChatMessageService {
  abstract chatAsync(
    userPublicId: string,
    request: ChatMessageRequestDto,
  ): Promise<Result<ChatMessageResponseDto, AppError>>;
}
