import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public_route';

/**
 * Marks a route as public — bypasses `JwtAuthGuard` even when it is
 * registered globally. Use sparingly (login, refresh, webhooks).
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
