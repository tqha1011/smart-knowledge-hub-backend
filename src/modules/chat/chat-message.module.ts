import { Module } from '@nestjs/common';
import { KnowledgeSpaceModule } from 'src/modules/knowledge-space/knowledgeSpace.module';
import { RagModule } from 'src/modules/rag/rag.module';
import { IChatAnswerService } from './application/interfaces/chat-answer.service.interface';
import { IChatMessageService } from './application/interfaces/chat-message.service.interface';
import { ChatAnswerService } from './application/services/chat-answer.service';
import { ChatMessageService } from './application/services/chat-message.service';
import { IAnswerSourceRepository } from './domain/repositories/answer-source.repo.interface';
import { IChatMessageRepository } from './domain/repositories/chat-message.repo.interface';
import { IChatSessionRepository } from './domain/repositories/chat-session.repo.interface';
import { IUnansweredQuestionRepository } from './domain/repositories/unanswered-question.repo.interface';
import { AnswerSourceRepository } from './infrastructure/answer-source.repo';
import { ChatMessageRepository } from './infrastructure/chat-message.repo';
import { ChatSessionRepository } from './infrastructure/chat-session.repo';
import { UnansweredQuestionRepository } from './infrastructure/unanswered-question.repo';

@Module({
  imports: [KnowledgeSpaceModule, RagModule],
  providers: [
    {
      provide: IChatMessageRepository,
      useClass: ChatMessageRepository,
    },
    {
      provide: IChatSessionRepository,
      useClass: ChatSessionRepository,
    },
    {
      provide: IAnswerSourceRepository,
      useClass: AnswerSourceRepository,
    },
    {
      provide: IUnansweredQuestionRepository,
      useClass: UnansweredQuestionRepository,
    },
    {
      provide: IChatAnswerService,
      useClass: ChatAnswerService,
    },
    {
      provide: IChatMessageService,
      useClass: ChatMessageService,
    },
  ],
  exports: [IChatMessageRepository, IChatMessageService],
})
export class ChatMessageModule {}
