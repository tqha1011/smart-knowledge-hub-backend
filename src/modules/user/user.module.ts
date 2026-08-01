import { Global, Module } from '@nestjs/common';
import { PrismaModule } from 'src/shared/infrastructure/database/prisma.module';
import { IUserRepository } from './domain/repositories/user.repo.interface';
import { UserRepository } from './infrastructure/user.repo';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: IUserRepository,
      useClass: UserRepository,
    },
  ],
  exports: [IUserRepository],
})
export class UserModule {}
