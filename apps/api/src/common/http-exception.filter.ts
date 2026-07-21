import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from '@todo/shared';

/**
 * Global error envelope (technical-design §7 D6). Every error response is the
 * shape `{ statusCode, code, message, fields? }` (ApiError). HttpExceptions carry
 * a `code`/`fields` in their response body (thrown by the controller and by the
 * ValidationPipe exceptionFactory); anything else is a 500 internal_error, logged.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const body: Record<string, unknown> =
        typeof raw === 'object' && raw !== null
          ? (raw as Record<string, unknown>)
          : {};
      const envelope: ApiError = {
        statusCode: status,
        code: (body.code as string) ?? 'error',
        message:
          (body.message as string) ??
          (typeof raw === 'string' ? raw : exception.message),
        ...(Array.isArray(body.fields)
          ? { fields: body.fields as ApiError['fields'] }
          : {}),
      };
      res.status(status).json(envelope);
      return;
    }

    this.logger.error(
      JSON.stringify({ msg: 'unhandled exception', error: String(exception) }),
    );
    const envelope: ApiError = {
      statusCode: 500,
      code: 'internal_error',
      message: 'Something went wrong. Please try again.',
    };
    res.status(500).json(envelope);
  }
}
