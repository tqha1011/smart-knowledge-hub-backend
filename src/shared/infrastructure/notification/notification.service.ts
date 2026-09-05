import { MailerService } from '@nestjs-modules/mailer';
import { WorkerHost, Processor } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { Cache } from 'cache-manager';
import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { CacheKey } from 'src/shared/domain/cacheKey';
import { QueueName } from '../queue/constant/queue-name';
import { SendEmailJobRequestDto } from '../queue/types/job.request.dto';
import { AddMemberRequestDto } from 'src/modules/knowledge-space/application/dtos/knowledgeSpace.request.dto';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { ConfigService } from '@nestjs/config';

const OTP_TTL_MS = 5 * 60 * 1000;

export class NotificationService {
  constructor(
    private readonly mailService: MailerService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}
  async sendOtpAsync(
    email: string,
    userName: string,
  ): Promise<Result<undefined, AppError>> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const cacheKey = CacheKey.generateOtpKey(email);
    await this.cacheManager.set(cacheKey, otp, OTP_TTL_MS);
    try {
      await this.mailService.sendMail({
        to: email,
        subject: 'Your verification code',
        template: 'otp-verification',
        context: {
          userName: userName,
          otp: otp,
          expiresInMinutes: 5,
        },
      });
    } catch (error) {
      await this.cacheManager.del(cacheKey);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to send OTP: ${error}`,
        ),
      );
    }
    return ok(undefined);
  }
}

@Processor(QueueName.SendEmailQueue)
export class SendEmailService extends WorkerHost {
  private readonly logger = new Logger(SendEmailService.name);
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    super();
  }
  async process(job: Job<SendEmailJobRequestDto>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
    const result = await this.notifyMembersAdded(
      job.data.inviterPublicId,
      job.data.knowledgeSpaceId,
      job.data.members,
      job.data.userIdByEmail,
    );
    if (result instanceof Error) {
      this.logger.error(`Failed to process job ${job.id}`, result);
      throw result; // throw for bullmq can retry
    } else {
      this.logger.log(`Successfully processed job ${job.id}`);
    }
  }

  private async notifyMembersAdded(
    inviterPublicId: string,
    knowledgeSpaceId: number,
    members: AddMemberRequestDto[],
    userIdByEmail: Map<string, number>,
  ): Promise<void | Error> {
    try {
      const [inviterResult, spaceNameResult, contactsResult] =
        await Promise.all([
          this.userRepository.GetUserDataByPublicId(inviterPublicId),
          this.knowledgeSpaceRepository.getKnowledgeSpaceNameById(
            knowledgeSpaceId,
          ),
          this.userRepository.GetUsersContactDataByIds([
            ...userIdByEmail.values(),
          ]),
        ]);
      if (
        inviterResult.isErr() ||
        spaceNameResult.isErr() ||
        contactsResult.isErr()
      ) {
        throw new Error('Failed to resolve data needed for the email');
      }

      const roleByUserId = new Map(
        members.map((m) => [userIdByEmail.get(m.email), m.role]),
      );
      const loginUrl = this.configService.get<string>('FRONTEND_URL');
      const knowledgeSpaceName = spaceNameResult.value ?? 'a knowledge space';
      const invitedBy = inviterResult.value?.name;

      await Promise.all(
        contactsResult.value.map((contact) =>
          this.mailerService.sendMail({
            to: contact.email,
            subject: `You've been added to ${knowledgeSpaceName}`,
            template: 'member-added',
            context: {
              memberName: contact.username,
              role: roleByUserId.get(contact.id),
              knowledgeSpaceName,
              invitedBy,
              loginUrl,
            },
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        'Failed to send member-added notification emails',
        error,
      );
    }
  }
}
