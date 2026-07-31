import { Global, Module } from '@nestjs/common';
import { PrismaModule } from 'src/shared/infrastructure/database/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
})
export class UserModule {}
