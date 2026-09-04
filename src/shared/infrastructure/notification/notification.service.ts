import { MailerService } from '@nestjs-modules/mailer';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { CacheKey } from 'src/shared/domain/cacheKey';

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
