import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Strongly-typed accessor over `ConfigService`. The rest of the backend
 * depends on this class instead of injecting `ConfigService` directly, so any
 * env-key change is caught at compile time.
 */
@Injectable()
export class EnvConfig {
  constructor(private readonly config: ConfigService) {}

  // ── Server ───────────────────────────────────────────────────────────
  get nodeEnv(): 'development' | 'production' | 'test' {
    return this.required('NODE_ENV') as 'development' | 'production' | 'test';
  }
  get port(): number {
    return Number(this.required('PORT'));
  }
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
  /**
   * Public HTTPS URL the backend is reachable at from the internet.
   * Empty string when not configured (local-only dev). Used to compose
   * webhook callback URLs (`<base>/webhooks/github`, `<base>/webhooks/jira`)
   * for GitHub and Jira webhook configuration.
   */
  get publicBaseUrl(): string {
    return (this.config.get<string>('PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
  }
  get githubWebhookCallbackUrl(): string {
    const base = this.publicBaseUrl;
    return base ? `${base}/webhooks/github` : '';
  }
  get jiraWebhookCallbackUrl(): string {
    const base = this.publicBaseUrl;
    return base ? `${base}/webhooks/jira` : '';
  }

  // ── Database ─────────────────────────────────────────────────────────
  get databaseUrl(): string {
    return this.required('DATABASE_URL');
  }

  // ── JWT ──────────────────────────────────────────────────────────────
  get jwtPrivateKey(): string {
    return Buffer.from(this.required('JWT_PRIVATE_KEY'), 'base64').toString('utf8');
  }
  get jwtPublicKey(): string {
    return Buffer.from(this.required('JWT_PUBLIC_KEY'), 'base64').toString('utf8');
  }
  get jwtAccessExpiry(): string {
    return this.required('JWT_ACCESS_EXPIRY');
  }
  get jwtRefreshExpiry(): string {
    return this.required('JWT_REFRESH_EXPIRY');
  }

  // ── Bootstrap super-admin ────────────────────────────────────────────
  get bootstrapAdminEmail(): string {
    return this.required('BOOTSTRAP_ADMIN_EMAIL');
  }
  get bootstrapAdminPassword(): string {
    return this.required('BOOTSTRAP_ADMIN_PASSWORD');
  }
  get bootstrapAdminFullName(): string {
    return this.required('BOOTSTRAP_ADMIN_FULL_NAME');
  }

  // ── LLM providers ────────────────────────────────────────────────────
  get geminiApiKey(): string {
    return this.required('GEMINI_API_KEY');
  }
  get openaiApiKey(): string {
    return this.required('OPENAI_API_KEY');
  }
  get anthropicApiKey(): string | undefined {
    return this.config.get<string>('ANTHROPIC_API_KEY') || undefined;
  }

  // ── Jira ─────────────────────────────────────────────────────────────
  get jiraBaseUrl(): string {
    return this.required('JIRA_BASE_URL');
  }
  get jiraEmail(): string {
    return this.required('JIRA_EMAIL');
  }
  get jiraApiToken(): string {
    return this.required('JIRA_API_TOKEN');
  }
  get jiraProjectKey(): string {
    return this.required('JIRA_PROJECT_KEY');
  }
  get jiraWebhookSecret(): string {
    return this.required('JIRA_WEBHOOK_SECRET');
  }

  // ── GitHub ───────────────────────────────────────────────────────────
  get githubToken(): string {
    return this.required('GITHUB_TOKEN');
  }
  /**
   * Returns just the owner. Defensive against users who pasted a full repo
   * URL into GITHUB_REPO (or GITHUB_OWNER) — extracts the owner segment
   * from `https://github.com/<owner>/<repo>` and similar shapes.
   */
  get githubOwner(): string {
    const raw = this.required('GITHUB_OWNER');
    return this.parseGithubSlug(raw, this.config.get<string>('GITHUB_REPO') ?? '').owner;
  }
  /**
   * Returns just the repo name. Defensive against URL-format values.
   */
  get githubRepo(): string {
    const raw = this.required('GITHUB_REPO');
    return this.parseGithubSlug(this.config.get<string>('GITHUB_OWNER') ?? '', raw).repo;
  }
  get githubWebhookSecret(): string {
    return this.required('GITHUB_WEBHOOK_SECRET');
  }

  /**
   * Normalizes GITHUB_OWNER and GITHUB_REPO to a `{owner, repo}` pair, no
   * matter whether the user pasted plain values, full URLs, or a mix.
   *
   * Accepted shapes (any combination across the two env vars):
   *   GITHUB_OWNER=Texelbit              GITHUB_REPO=sre-agent-demo
   *   GITHUB_OWNER=Texelbit              GITHUB_REPO=https://github.com/Texelbit/sre-agent-demo
   *   GITHUB_OWNER=https://github.com/Texelbit/sre-agent-demo  (repo ignored)
   */
  private parseGithubSlug(
    ownerRaw: string,
    repoRaw: string,
  ): { owner: string; repo: string } {
    const fromUrl = (value: string): { owner: string; repo: string } | null => {
      const m = value.match(/github\.com[/:]([^/]+)\/([^/.\s]+)/i);
      if (!m) return null;
      return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
    };

    // If either var contains a full URL, prefer that as the source of truth.
    return (
      fromUrl(repoRaw) ??
      fromUrl(ownerRaw) ?? {
        owner: ownerRaw,
        repo: repoRaw,
      }
    );
  }

  // ── Email (SMTP) + Slack ─────────────────────────────────────────────
  get smtpService(): string | undefined {
    const v = this.config.get<string>('SMTP_SERVICE');
    return v && v.length > 0 ? v : undefined;
  }
  get smtpHost(): string {
    return this.required('SMTP_HOST');
  }
  get smtpPort(): number {
    return Number(this.required('SMTP_PORT'));
  }
  get smtpSecure(): boolean {
    const raw = this.config.get<string | boolean>('SMTP_SECURE');
    return raw === true || raw === 'true';
  }
  get smtpUser(): string {
    return this.required('SMTP_USER');
  }
  get smtpPass(): string {
    return this.required('SMTP_PASS');
  }
  /** Canonical RFC 5322 from address (e.g. `Ancízar <gerencia@texelbit.com>`). */
  get emailFrom(): string {
    return this.required('EMAIL_FROM');
  }
  get emailAppName(): string {
    return this.config.get<string>('EMAIL_APP_NAME') ?? 'SRE Agent';
  }
  get emailDefaultCompany(): string {
    return this.config.get<string>('EMAIL_DEFAULT_COMPANY') ?? '';
  }
  get emailSupportEmail(): string {
    return this.config.get<string>('EMAIL_SUPPORT_EMAIL') ?? '';
  }
  get emailCompanyAddress(): string {
    return this.config.get<string>('EMAIL_COMPANY_ADDRESS') ?? '';
  }
  get teamEmail(): string {
    // Optional fallback distro — empty string when not configured.
    return this.config.get<string>('TEAM_EMAIL') ?? '';
  }
  get slackWebhookUrl(): string {
    return this.required('SLACK_WEBHOOK_URL');
  }

  // ── RAG ──────────────────────────────────────────────────────────────
  // Both paths are optional — empty string means "no folder available, skip".
  // The indexer service handles missing folders gracefully.
  get ecommerceRefPath(): string {
    return this.config.get<string>('ECOMMERCE_REF_PATH') ?? '';
  }
  get ecommerceRefRepoUrl(): string {
    return this.config.get<string>('ECOMMERCE_REF_REPO_URL') ?? '';
  }
  get logsPath(): string {
    return this.config.get<string>('LOGS_PATH') ?? '';
  }

  // ── helpers ──────────────────────────────────────────────────────────
  private required(key: string): string {
    const value = this.config.get<string>(key);
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
  }
}
