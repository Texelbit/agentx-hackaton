import { Role } from '../../common/enums';

/**
 * Shape of the access token payload signed with RS256.
 * Refresh tokens are opaque UUIDs and are NEVER decoded — only their bcrypt
 * hash is stored in the `refresh_tokens` table.
 */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  permissions: string[];
  isProtected: boolean;
  iat?: number;
  exp?: number;
}
