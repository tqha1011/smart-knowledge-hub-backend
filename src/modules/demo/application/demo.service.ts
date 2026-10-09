import {
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcrypt';
import { createHmac, randomBytes } from 'node:crypto';
import { DemoRepository } from '../infrastructure/demo.repo';
import {
  DEMO_SAMPLE_QUESTIONS,
  demoOptions,
  isDemoActive,
  nextUtcDay,
} from '../domain/demo-policy';

@Injectable()
export class DemoService {
  readonly options;
  constructor(
    private readonly repo: DemoRepository,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.options = demoOptions(config);
  }
  async publicConfig() {
    const enabled =
      this.options.enabled &&
      (await this.repo.spaceExists(this.options.spacePublicId));
    return {
      enabled,
      durationSeconds: this.options.durationSeconds,
      questionLimit: this.options.questionLimit,
      sampleQuestions: enabled ? DEMO_SAMPLE_QUESTIONS : [],
    };
  }
  async create(ip: string) {
    if (!this.options.enabled)
      throw new ServiceUnavailableException('Demo mode is disabled.');
    const ipHash = createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_SECRET'),
    )
      .update(ip)
      .digest('hex');
    const password = await hash(randomBytes(32).toString('hex'), 10);
    const session = await this.repo.create(ipHash, password, this.options);
    const accessToken = await this.jwt.signAsync(
      {
        sub: session.user.publicId,
        email: session.user.email,
        role: 'employee',
        type: 'demo',
        demoSessionPublicId: session.publicId,
      },
      {
        expiresIn: Math.max(
          1,
          Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
        ),
      },
    );
    return {
      accessToken,
      expiresAt: session.expiresAt,
      knowledgeSpacePublicId: session.knowledgeSpace.publicId,
      remainingQuestions: this.options.questionLimit,
    };
  }
  async status(userPublicId: string) {
    const session = await this.repo.findByUser(userPublicId);
    if (
      !this.options.enabled ||
      !session ||
      !isDemoActive(session) ||
      session.knowledgeSpace.publicId !== this.options.spacePublicId
    )
      throw new UnauthorizedException('Demo session expired.');
    const usage = await this.repo.dailyUsage();
    return {
      expiresAt: session.expiresAt,
      knowledgeSpacePublicId: session.knowledgeSpace.publicId,
      remainingQuestions: Math.max(
        0,
        this.options.questionLimit - session.questionCount,
      ),
      dailyQuestionBudgetExhausted:
        (usage?.questionCount ?? 0) >= this.options.dailyQuestionLimit,
      resetAt: nextUtcDay(),
    };
  }
  async revoke(userPublicId: string) {
    await this.status(userPublicId);
    await this.repo.revoke(userPublicId);
  }
}
