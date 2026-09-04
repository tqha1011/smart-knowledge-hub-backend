import { MailerService } from '@nestjs-modules/mailer';
import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';

export class NotificationService {
  constructor(private readonly mailService: MailerService) {}
  async sendOtpAsync(
    email: string,
    userName: string,
  ): Promise<Result<undefined, AppError>> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
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
