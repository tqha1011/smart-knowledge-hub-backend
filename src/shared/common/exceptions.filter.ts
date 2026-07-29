import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { toHttpException } from './app-error.mapper';
import { AppError } from './errorCode';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Domain and application code throws AppError. Translating it here is
    // what lets controllers stay free of try/catch.
    const error =
      exception instanceof AppError ? toHttpException(exception) : exception;

    const status =
      error instanceof HttpException
        ? error.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof Error) {
      this.logger.error(
        `[${request.method}] ${request.url} - Status: ${status} - Lỗi: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `[${request.method}] ${request.url} - Lỗi không xác định`,
        exception,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        error instanceof HttpException
          ? error.message
          : 'Internal Server Error',
    });
  }
}
