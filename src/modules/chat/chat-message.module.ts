import { Module } from '@nestjs/common';
import { KnowledgeSpaceModule } from 'src/modules/knowledge-space/knowledgeSpace.module';
import { RagModule } from 'src/modules/rag/rag.module';
import { ChatMessageController } from './api/chat-message.controller';
import { UnansweredQuestionController } from './api/unanswered-question.controller';
import { IChatAnswerService } from './application/interfaces/chat-answer.service.interface';
import { IChatMessageService } from './application/interfaces/chat-message.service.interface';
import { IUnansweredQuestionQueryRepository } from './application/interfaces/unanswered-question.query.repo.interface';
import { IUnansweredQuestionService } from './application/interfaces/unanswered-question.service.interface';
import { ChatAnswerService } from './application/services/chat-answer.service';
import { ChatMessageService } from './application/services/chat-message.service';
import { UnansweredQuestionService } from './application/services/unanswered-question.service';
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
  controllers: [ChatMessageController, UnansweredQuestionController],
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
      provide: IUnansweredQuestionQueryRepository,
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
    {
      provide: IUnansweredQuestionService,
      useClass: UnansweredQuestionService,
    },
  ],
  exports: [IChatMessageRepository, IChatMessageService],
})
export class ChatMessageModule {}
