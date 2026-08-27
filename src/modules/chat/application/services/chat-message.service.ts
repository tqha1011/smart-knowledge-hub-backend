// import { Result, err } from 'neverthrow';
// import { AppError, ErrorCode } from 'src/shared/common/errorCode';
// import { IChatMessageRepository } from '../../domain/repositories/chat-message.repo.interface';
// import { ChatMessageRequestDto } from '../dtos/chat-message.request.dto';
// import { IChatMessageService } from '../interfaces/chat-message.service.interface';

// export class ChatMessageService implements IChatMessageService {
//   constructor(private readonly chatMessageRepository: IChatMessageRepository) {}
//   async chatAsync(
//     request: ChatMessageRequestDto,
//   ): Promise<Result<undefined, AppError>> {
//     try {
//     } catch (error) {
//       return err(
//         new AppError(
//           ErrorCode.InternalServerError,
//           'Failed to add chat message.',
//         ),
//       );
//     }
//   }
// }
