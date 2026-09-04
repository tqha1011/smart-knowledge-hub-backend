import { Global, Module } from '@nestjs/common';
import { PrismaModule } from 'src/shared/infrastructure/database/prisma.module';
import { UserController } from './api/user.controller';
import { UserService } from './application/services/user.service';
import { IUserQueryRepository } from './application/interfaces/user-query.repo.interface';
import { IUserService } from './application/interfaces/user.service.interface';
import { IUserRepository } from './domain/repositories/user.repo.interface';
import { UserRepository } from './infrastructure/user.repo';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [UserController],
  providers: [
    {
      provide: IUserRepository,
      useClass: UserRepository,
    },
    {
      provide: IUserQueryRepository,
      useClass: UserRepository,
    },
    {
      provide: IUserService,
      useClass: UserService,
    },
  ],
  exports: [IUserRepository, IUserQueryRepository, IUserService],
})
export class UserModule {}
