import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppError, ErrorCode } from './errorCode';

/**
 * Translates a domain/application `AppError` into the matching Nest HTTP
 * exception. Controllers use this in `result.match(...)` so the error channel
 * of a `Result` becomes the correct HTTP status.
 */
export function toHttpException(error: AppError): HttpException {
  switch (error.code) {
    case ErrorCode.ServiceUnavailable:
      return new ServiceUnavailableException(error.message);
    case ErrorCode.Gone:
      return new GoneException(error.message);
    case ErrorCode.Conflict:
      return new ConflictException(error.message);
    case ErrorCode.NotFound:
      return new NotFoundException(error.message);
    case ErrorCode.BadRequest:
      return new BadRequestException(error.message);
    case ErrorCode.Unauthorized:
      return new UnauthorizedException(error.message);
    case ErrorCode.Forbidden:
      return new ForbiddenException(error.message);
    case ErrorCode.TooManyRequests:
      return new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
    case ErrorCode.InternalServerError:
      return new InternalServerErrorException(error.message);
  }
}
