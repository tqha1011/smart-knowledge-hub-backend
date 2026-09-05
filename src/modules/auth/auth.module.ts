import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './api/auth.controller';
import { IAuthService } from './application/interfaces/auth.service.interface';
import { AuthService } from './application/services/auth.service';
import {
  IPasswordHasher,
  IRefreshTokenProvider,
  IRefreshTokenRepository,
  ITokenProvider,
} from './domain/repositories/auth.interface';
import { PasswordHasher } from './infrastructure/passwordHasher';
import { RefreshTokenProvider } from './infrastructure/refreshTokenProvider';
import { RefreshTokenRepository } from './infrastructure/refreshToken.repo';
import { TokenProvider } from './infrastructure/tokenProvider';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secretKey = configService.get<string>('JWT_SECRET');
        if (!secretKey) {
          throw new Error('JWT_SECRET is not defined in environment variables');
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
  controllers: [AuthController],
  providers: [
    {
      provide: ITokenProvider,
      useClass: TokenProvider,
    },
    {
      provide: IPasswordHasher,
      useClass: PasswordHasher,
    },
    {
      provide: IRefreshTokenRepository,
      useClass: RefreshTokenRepository,
    },
    {
      provide: IRefreshTokenProvider,
      useClass: RefreshTokenProvider,
    },
    {
      provide: IAuthService,
      useClass: AuthService,
    },
  ],
  exports: [ITokenProvider, IPasswordHasher, IAuthService, JwtModule],
})
export class AuthModule {}
