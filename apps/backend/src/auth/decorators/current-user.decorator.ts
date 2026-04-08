import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Resolves the user attached by `JwtStrategy.validate()` to `request.user`.
 *
 * Usage:
 *   `findMine(@CurrentUser() user: AuthenticatedUser)`
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);
