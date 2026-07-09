import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './api/auth.controller';
import {
  IPasswordHasher,
  ITokenProvider,
} from './domain/repositories/auth.repo.interface';
import { PasswordHasher } from './infrastructure/repositories/passwordHasher';
import { TokenProvider } from './infrastructure/repositories/tokenProvider';

@Global()
@Module({
  controllers: [AuthController],
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secretKey = configService.get<string>('JWT_SECRET_KEY');
        if (!secretKey) {
          throw new Error(
            'JWT_SECRET_KEY is not defined in environment variables',
          );
        }
        return {
          secret: secretKey,
          signOptions: {
            expiresIn: '1h',
          },
        };
      },
    }),
  ],
  providers: [
    {
      provide: IPasswordHasher,
      useClass: PasswordHasher,
    },
    {
      provide: ITokenProvider,
      useClass: TokenProvider,
    },
  ],
  exports: [IPasswordHasher, ITokenProvider, JwtModule],
})
export class AuthModule {}
