import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Structured request/response logger. Emits a single JSON line per request
 * with method, path, status, duration and (when authenticated) the user ID.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const start = Date.now();
    const { method, originalUrl } = request;
    const userId =
      (request as Request & { user?: { id?: string } }).user?.id ?? null;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          this.logger.log(
            JSON.stringify({
              method,
              path: originalUrl,
              userId,
              durationMs: duration,
              outcome: 'success',
            }),
          );
        },
        error: (err: Error) => {
          const duration = Date.now() - start;
          this.logger.warn(
            JSON.stringify({
              method,
              path: originalUrl,
              userId,
              durationMs: duration,
              outcome: 'error',
              error: err.message,
            }),
          );
        },
      }),
    );
  }
}
