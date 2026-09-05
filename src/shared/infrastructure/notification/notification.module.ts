import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { MailerModule } from '@nestjs-modules/mailer';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { CachingModule } from '../cache/caching.module';
import { NotificationService, SendEmailService } from './notification.service';

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.getOrThrow<string>('SMTP_HOST'),
          port: config.get<number>('SMTP_PORT', 587),
          secure: false,
          auth: {
            user: config.getOrThrow<string>('SMTP_USER'),
            pass: config.getOrThrow<string>('SMTP_PASSWORD'),
          },
        },
        defaults: {
          from: config.get<string>(
            'SMTP_FROM',
            '"Smart Knowledge Portal" <noreply@company.com>',
          ),
        },
        template: {
          dir: join(process.cwd(), 'templates'),
          adapter: new HandlebarsAdapter(),
        },
      }),
    }),
    CachingModule,
  ],
  providers: [NotificationService, SendEmailService],
  exports: [MailerModule, NotificationService],
})
export class NotificationModule {}
