import { Module } from '@nestjs/common';
import { IChatMessageRepository } from './domain/repositories/chat-message.repo.interface';
import { ChatMessageRepository } from './infrastructure/chat-message.repo';

@Module({
  imports: [],
  providers: [
    {
      provide: IChatMessageRepository,
      useClass: ChatMessageRepository,
    },
  ],
  exports: [IChatMessageRepository],
})
export class ChatMessageModule {}
