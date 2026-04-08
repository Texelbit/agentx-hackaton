import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Centralized exception filter. Maps known error types (HttpException,
 * Prisma errors) to consistent JSON responses and logs anything unexpected
 * with full stack traces.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, error, message } = this.resolveError(exception);

    const body: ErrorResponseBody = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${request.method} ${request.url}] ${error}: ${JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `[${request.method} ${request.url}] ${status} ${error}`,
      );
    }

    response.status(status).json(body);
  }

  private resolveError(exception: unknown): {
    status: number;
    error: string;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const status = exception.getStatus();
      if (typeof res === 'string') {
        return { status, error: exception.name, message: res };
      }
      const obj = res as Record<string, unknown>;
      return {
        status,
        error: (obj.error as string) ?? exception.name,
        message: (obj.message as string | string[]) ?? exception.message,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: 'PrismaValidationError',
        message: exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message:
        exception instanceof Error ? exception.message : 'Unexpected error',
    };
  }

  private mapPrismaError(err: Prisma.PrismaClientKnownRequestError): {
    status: number;
    error: string;
    message: string;
  } {
    switch (err.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          error: 'UniqueConstraintViolation',
          message: `Duplicate value for unique field(s): ${(err.meta?.target as string[])?.join(', ') ?? 'unknown'}`,
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          error: 'NotFound',
          message: 'Requested record does not exist',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: 'ForeignKeyViolation',
          message: 'Referenced record does not exist',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'PrismaError',
          message: err.message,
        };
    }
  }
}
