import { Injectable, Logger } from '@nestjs/common';
import { EnvConfig } from '../../config/env.config';

interface GitHubBranchRef {
  ref: string;
  object: { sha: string };
}

interface GitHubRepoInfo {
  default_branch: string;
  permissions?: { admin: boolean; push: boolean; pull: boolean };
}

interface GitHubWebhook {
  id: number;
  name: string;
  active: boolean;
  events: string[];
  config: {
    url: string;
    content_type: string;
    insecure_ssl?: string;
  };
}

export interface EnsureWebhookResult {
  hookId: number;
  action: 'created' | 'updated' | 'unchanged';
  url: string;
  events: string[];
}

/**
 * Thin REST client over the GitHub v3 API.
 *
 * Auth: token in `Authorization: token ...` header — works for classic and
 * fine-grained PATs as well as GitHub Apps installation tokens.
 */
@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private readonly base = 'https://api.github.com';

  constructor(private readonly env: EnvConfig) {}

  // ── Validation (used by github.seed.ts) ──────────────────────────────

  async getRepoInfo(): Promise<GitHubRepoInfo> {
    return this.request<GitHubRepoInfo>(
      `/repos/${this.env.githubOwner}/${this.env.githubRepo}`,
    );
  }

  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.request(
        `/repos/${this.env.githubOwner}/${this.env.githubRepo}/branches/${encodeURIComponent(branchName)}`,
      );
      return true;
    } catch {
      return false;
    }
  }

  // ── Branch creation ──────────────────────────────────────────────────

  /**
   * Creates `branchName` from the tip of `baseBranch`.
   * Throws if the branch already exists or the base is missing.
   */
  async createBranch(branchName: string, baseBranch: string): Promise<string> {
    const baseRef = await this.request<GitHubBranchRef>(
      `/repos/${this.env.githubOwner}/${this.env.githubRepo}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
    );

    const created = await this.request<GitHubBranchRef>(
      `/repos/${this.env.githubOwner}/${this.env.githubRepo}/git/refs`,
      {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseRef.object.sha,
        }),
      },
    );

    return created.ref.replace('refs/heads/', '');
  }

  branchUrl(branchName: string): string {
    return `https://github.com/${this.env.githubOwner}/${this.env.githubRepo}/tree/${encodeURIComponent(branchName)}`;
  }

  // ── Webhook management (used by github.seed.ts) ──────────────────────

  /**
   * Idempotently ensures a webhook with the given URL + events + secret
   * exists on the configured repo. Behavior:
   *
   *  1. Lists existing hooks via `GET /repos/{owner}/{repo}/hooks`
   *  2. If a hook with the same `config.url` exists → updates it (events,
   *     content_type, secret) via PATCH and returns `action: 'updated'`
   *     (or `'unchanged'` if every field already matched)
   *  3. Otherwise creates a new hook via POST and returns `action: 'created'`
   *
   * Requires the `Webhooks: Read and write` repository permission on the
   * fine-grained PAT, or `admin:repo_hook` scope on a classic PAT. Throws
   * with the GitHub API error body when the token lacks permissions so the
   * caller can surface an actionable message.
   */
  async ensureWebhook(args: {
    url: string;
    secret: string;
    events: string[];
  }): Promise<EnsureWebhookResult> {
    const { owner, repo } = { owner: this.env.githubOwner, repo: this.env.githubRepo };

    const existing = await this.request<GitHubWebhook[]>(
      `/repos/${owner}/${repo}/hooks`,
    );

    const match = existing.find((h) => h.config.url === args.url);

    const desiredConfig = {
      url: args.url,
      content_type: 'json',
      secret: args.secret,
      insecure_ssl: '0',
    };

    if (match) {
      // Diff what we can read back (the secret is never returned by the API,
      // so we always re-send it to keep verification in sync).
      const sameEvents =
        match.events.length === args.events.length &&
        match.events.every((e) => args.events.includes(e));
      const sameContentType = match.config.content_type === 'json';
      const sameActive = match.active === true;

      if (sameEvents && sameContentType && sameActive) {
        // Still PATCH to refresh the secret in case it was rotated locally
        await this.request(`/repos/${owner}/${repo}/hooks/${match.id}/config`, {
          method: 'PATCH',
          body: JSON.stringify(desiredConfig),
        });
        this.logger.log(
          `Webhook ${match.id} for ${args.url} already up-to-date (secret refreshed)`,
        );
        return {
          hookId: match.id,
          action: 'unchanged',
          url: args.url,
          events: args.events,
        };
      }

      const updated = await this.request<GitHubWebhook>(
        `/repos/${owner}/${repo}/hooks/${match.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            active: true,
            events: args.events,
            config: desiredConfig,
          }),
        },
      );
      this.logger.log(`Webhook ${updated.id} updated for ${args.url}`);
      return {
        hookId: updated.id,
        action: 'updated',
        url: args.url,
        events: args.events,
      };
    }

    const created = await this.request<GitHubWebhook>(
      `/repos/${owner}/${repo}/hooks`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'web',
          active: true,
          events: args.events,
          config: desiredConfig,
        }),
      },
    );
    this.logger.log(`Webhook ${created.id} created for ${args.url}`);
    return {
      hookId: created.id,
      action: 'created',
      url: args.url,
      events: args.events,
    };
  }

  /**
   * Removes any webhook on the repo whose config.url matches `url`. Used
   * when the user rotates their tunnel and the old URL is unreachable.
   */
  async removeWebhookByUrl(url: string): Promise<number> {
    const { owner, repo } = { owner: this.env.githubOwner, repo: this.env.githubRepo };
    const existing = await this.request<GitHubWebhook[]>(
      `/repos/${owner}/${repo}/hooks`,
    );
    const matches = existing.filter((h) => h.config.url === url);
    for (const m of matches) {
      await this.request(`/repos/${owner}/${repo}/hooks/${m.id}`, {
        method: 'DELETE',
      });
    }
    return matches.length;
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async request<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `token ${this.env.githubToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`GitHub ${init.method ?? 'GET'} ${path} → ${res.status}: ${text}`);
      throw new Error(`GitHub API error ${res.status}: ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
