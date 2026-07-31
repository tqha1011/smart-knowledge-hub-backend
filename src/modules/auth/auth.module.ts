import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IAuthService } from './application/interfaces/auth.service.interface';
import { AuthService } from './application/services/auth.service';
import {
  IPasswordHasher,
  ITokenProvider,
} from './domain/repositories/auth.interface';
import { PasswordHasher } from './infrastructure/paswordHasher';
import { TokenProvider } from './infrastructure/tokenProvider';

@Global()
@Module({
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
      provide: IAuthService,
      useClass: AuthService,
    },
  ],
  exports: [ITokenProvider, IPasswordHasher, IAuthService, JwtModule],
})
export class AuthModule {}
