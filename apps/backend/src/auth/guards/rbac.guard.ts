import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Permission } from '../../common/enums';
import { PERMISSION_METADATA_KEY } from '../decorators/require-permission.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Reads the `@RequirePermission()` metadata and checks that the
 * authenticated user holds the corresponding permission. If no metadata is
 * present the guard is a no-op.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!user.permissions.includes(required)) {
      throw new ForbiddenException(
        `Missing required permission: ${required}`,
      );
    }

    return true;
  }
}
