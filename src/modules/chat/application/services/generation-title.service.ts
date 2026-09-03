import { Processor, WorkerHost } from '@nestjs/bullmq';
import { QueueName } from 'src/shared/infrastructure/queue/constant/queue-name';
import { GenerateTitleJobRequestDto } from 'src/shared/infrastructure/queue/types/job.request.dto';
import { IChatSessionRepository } from '../../domain/repositories/chat-session.repo.interface';
import { IChatMessageRepository } from '../../domain/repositories/chat-message.repo.interface';
import { PaginationRequest } from 'src/shared/common/pagination';
import { IAnswerGenerationClient } from 'src/modules/rag/domain/repositories/answer-generation-client.interface';
import { Job } from 'bullmq';

const pagination: PaginationRequest = { pageNumber: 1, pageSize: 2 };

@Processor(QueueName.GenerateTitleQueue)
export class GenerationTitleService extends WorkerHost {
  constructor(
    private readonly chatSessionRepository: IChatSessionRepository,
    private readonly chatMessageRepository: IChatMessageRepository,
    private readonly groqChatClient: IAnswerGenerationClient,
  ) {
    super();
  }
  async process(job: Job<GenerateTitleJobRequestDto>): Promise<void> {
    const chatSessionId =
      await this.chatSessionRepository.getSessionIdDataByPublicId(
        job.data.chatSessionPublicId,
        job.data.knowledgeSpacePublicId,
      );
    if (chatSessionId.isErr()) throw chatSessionId.error;

    if (!chatSessionId.value) throw new Error('Chat session not found');
    const messages = await this.chatMessageRepository.getMessagesBySessionId(
      chatSessionId.value.id,
      pagination,
    );
    if (messages.isErr()) throw messages.error;
    if (!messages.value) throw new Error('No messages found');
    const prompt = messages.value.items
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n');
    const title = await this.groqChatClient.generateSessionTitle(prompt);
    if (title.isErr()) throw title.error;
    await this.chatSessionRepository.updateSessionTitle(
      chatSessionId.value.id,
      title.value,
    );
  }
}
