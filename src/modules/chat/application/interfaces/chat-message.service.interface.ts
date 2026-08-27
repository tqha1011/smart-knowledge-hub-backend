import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { ChatMessageRequestDto } from '../dtos/chat-message.request.dto';

export abstract class IChatMessageService {
  abstract chatAsync(
    request: ChatMessageRequestDto,
  ): Promise<Result<undefined, AppError>>;
}
