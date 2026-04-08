/**
 * Canonical list of granular permissions enforced by `RbacGuard`.
 *
 * These values are persisted as rows in the `permissions` table by the
 * bootstrap seed. The enum exists so application code, decorators and DTOs
 * never use string literals to refer to a permission.
 */
export enum Permission {
  INCIDENTS_CREATE = 'incidents:create',
  INCIDENTS_READ_ALL = 'incidents:read:all',
  INCIDENTS_READ_OWN = 'incidents:read:own',
  INCIDENTS_UPDATE = 'incidents:update',
  INCIDENTS_LINK = 'incidents:link',
  USERS_MANAGE = 'users:manage',
  USERS_MANAGE_ADMINS = 'users:manage:admins',
  CONFIG_MANAGE = 'config:manage',
  ROLES_MANAGE = 'roles:manage',
  LLM_MANAGE = 'llm:manage',
  PRIORITIES_MANAGE = 'priorities:manage',
  AUDIT_READ = 'audit:read',
}

/**
 * Helper that returns every permission name as a flat array.
 * Used by the bootstrap seed to insert the `permissions` table.
 */
export const ALL_PERMISSIONS: Permission[] = Object.values(Permission);
