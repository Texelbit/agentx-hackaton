/**
 * Strongly-typed keys for the `system_config` table.
 * Avoids string literals scattered across services that read or write config.
 */
export const SystemConfigKey = {
  DEFAULT_BASE_BRANCH: 'default_base_branch',
  SIMILARITY_THRESHOLD: 'similarity_threshold',
  NOTIFICATION_RATE_LIMIT_SECONDS: 'notification_rate_limit_seconds',
  BRANCH_NAMING_PATTERN: 'branch_naming_pattern',
} as const;

export type SystemConfigKey =
  (typeof SystemConfigKey)[keyof typeof SystemConfigKey];
