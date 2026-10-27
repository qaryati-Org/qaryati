import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { codeForStatus, ErrorResponse } from './error-response';
import { ValidationException } from './validation.exception';

// Converts every thrown error into the ErrorResponse shape. Unknown errors
// become a generic 500 so internals (stack traces, SQL) never leak.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorResponse = {
      error: {
        code: codeForStatus(status),
        message: messageOf(exception, status),
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId,
      },
    };
    if (exception instanceof ValidationException) {
      body.error.code = 'VALIDATION_ERROR';
      body.error.details = exception.fieldErrors;
    }

    if (status >= 500) {
      this.logger.error(
        `[${req.correlationId}] ${req.method} ${req.originalUrl} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(body);
  }
}

function messageOf(exception: unknown, status: number): string {
  if (status >= 500 || !(exception instanceof HttpException)) {
    return 'An unexpected error occurred';
  }
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: string | string[] }).message;
  return Array.isArray(message)
    ? message.join('; ')
    : (message ?? exception.message);
}
