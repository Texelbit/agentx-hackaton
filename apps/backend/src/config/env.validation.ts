import * as Joi from 'joi';

/**
 * Joi schema applied by `@nestjs/config` at startup. The application refuses
 * to boot if any required variable is missing or invalid — we never silently
 * fall back to a default for sensitive secrets.
 */
export const envValidationSchema = Joi.object({
  // ── Server ─────────────────────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  // Public HTTPS URL where this backend is reachable from the internet.
  // Used to compute webhook callback URLs that GitHub / Jira can hit.
  // Optional in dev when you don't need webhooks; required when you do.
  // Examples: https://hmkl21gb-3000.use2.devtunnels.ms (VS Code dev tunnel),
  //           https://abc123.ngrok-free.app           (ngrok)
  PUBLIC_BASE_URL: Joi.string().uri().optional().allow('').default(''),

  // ── Database ───────────────────────────────────────────────────────────
  DATABASE_URL: Joi.string().required(),

  // ── JWT (RS256) ────────────────────────────────────────────────────────
  JWT_PRIVATE_KEY: Joi.string().required(),
  JWT_PUBLIC_KEY: Joi.string().required(),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),

  // ── Bootstrap super-admin (seeded on first boot) ───────────────────────
  BOOTSTRAP_ADMIN_EMAIL: Joi.string().email().required(),
  BOOTSTRAP_ADMIN_PASSWORD: Joi.string().min(12).required(),
  BOOTSTRAP_ADMIN_FULL_NAME: Joi.string().required(),

  // ── LLM providers ──────────────────────────────────────────────────────
  GEMINI_API_KEY: Joi.string().required(),
  OPENAI_API_KEY: Joi.string().required(),
  ANTHROPIC_API_KEY: Joi.string().optional().allow(''),

  // ── Jira ───────────────────────────────────────────────────────────────
  JIRA_BASE_URL: Joi.string().uri().required(),
  JIRA_EMAIL: Joi.string().email().required(),
  JIRA_API_TOKEN: Joi.string().required(),
  JIRA_PROJECT_KEY: Joi.string().required(),
  JIRA_WEBHOOK_SECRET: Joi.string().required(),

  // ── GitHub ─────────────────────────────────────────────────────────────
  GITHUB_TOKEN: Joi.string().required(),
  GITHUB_OWNER: Joi.string().required(),
  GITHUB_REPO: Joi.string().required(),
  GITHUB_WEBHOOK_SECRET: Joi.string().required(),

  // ── Email (SMTP — Google Workspace by default) ─────────────────────────
  // Set SMTP_SERVICE='gmail' as a nodemailer shortcut (auto host/port/secure)
  // OR set SMTP_HOST/PORT/SECURE explicitly for non-Gmail providers.
  SMTP_SERVICE: Joi.string().optional().allow(''),
  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().email().required(),
  SMTP_PASS: Joi.string().required(),
  // EMAIL_FROM uses RFC 5322: `Display Name <email@domain>` (or just an email).
  EMAIL_FROM: Joi.string().required(),
  EMAIL_APP_NAME: Joi.string().default('SRE Agent'),
  EMAIL_DEFAULT_COMPANY: Joi.string().optional().allow('').default(''),
  EMAIL_SUPPORT_EMAIL: Joi.string().email().optional().allow(''),
  EMAIL_COMPANY_ADDRESS: Joi.string().optional().allow('').default(''),
  // TEAM_EMAIL is an optional fallback distro. The per-user notification
  // system uses `notification_preferences` to find recipients; this is only
  // a sanity-net mailing list for incidents that have no subscribed users.
  // Leave empty for solo / hackathon use.
  TEAM_EMAIL: Joi.string().email().optional().allow('').default(''),

  // ── Slack ──────────────────────────────────────────────────────────────
  SLACK_WEBHOOK_URL: Joi.string().uri().required(),

  // ── RAG ────────────────────────────────────────────────────────────────
  // Both paths are optional — the indexer simply skips a collection when its
  // folder does not exist. The init script overrides ECOMMERCE_REF_PATH at
  // spawn time when it clones the source repo into a temporary directory.
  ECOMMERCE_REF_REPO_URL: Joi.string().uri().optional().allow(''),
  ECOMMERCE_REF_PATH: Joi.string().optional().allow('').default(''),
  LOGS_PATH: Joi.string().optional().allow('').default(''),
});
