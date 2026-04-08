import { SetMetadata } from '@nestjs/common';
import { Permission } from '../../common/enums';

export const PERMISSION_METADATA_KEY = 'required_permission';

/**
 * Decorator consumed by `RbacGuard`. Always pass an enum value — string
 * literals are forbidden by convention.
 *
 *   @RequirePermission(Permission.INCIDENTS_READ_ALL)
 */
export const RequirePermission = (
  permission: Permission,
): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_METADATA_KEY, permission);
