import { Role } from '../../common/enums';

/**
 * Lightweight projection of a user that the JWT strategy attaches to every
 * authenticated request as `request.user`. Controllers retrieve it via the
 * `@CurrentUser()` decorator.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  permissions: string[];
  isProtected: boolean;
}
