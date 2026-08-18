import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';

export type PresignUploadInput = {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
};

export type PresignedUpload = {
  uploadUrl: string;
  key: string;
  expiresAt: Date;
};

export type ObjectMetadata = {
  contentType: string | null;
  contentLength: number;
  lastModified: Date | null;
};

export abstract class IFileStorage {
  /**
   * Only `content-length` lands in the signed headers, so the storage provider
   * rejects a mis-sized upload but accepts any content type. Callers must read
   * the stored type back with {@link GetObjectMetadata} instead of trusting the
   * one they signed.
   */
  abstract GetUploadUrl(
    input: PresignUploadInput,
  ): Promise<Result<PresignedUpload, AppError>>;

  /** `fileName` is what the browser saves the file as; it is not part of the key. */
  abstract GetDownloadUrl(
    key: string,
    fileName: string,
    expiresInSeconds?: number,
  ): Promise<Result<string, AppError>>;

  /** ok(null) when the object does not exist; err only on infrastructure failure. */
  abstract GetObjectMetadata(
    key: string,
  ): Promise<Result<ObjectMetadata | null, AppError>>;

  abstract DeleteObject(key: string): Promise<Result<void, AppError>>;
}
