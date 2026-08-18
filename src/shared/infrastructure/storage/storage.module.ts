import { Module } from '@nestjs/common';
import { IFileStorage } from './file-storage.interface';
import { S3FileStorage } from './s3-file-storage';

@Module({
  providers: [
    {
      provide: IFileStorage,
      useClass: S3FileStorage,
    },
  ],
  exports: [IFileStorage],
})
export class StorageModule {}
