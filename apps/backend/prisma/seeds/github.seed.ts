/**
 * GitHub seed — validates the configured repo is reachable + auto-installs
 * the webhook so the user never has to click around GitHub Settings.
 *
 * Steps:
 *   1. Verify token + scopes (no mutations)
 *   2. Verify repo exists and we have access (no mutations)
 *   3. Verify the configured default base branch exists (no mutations)
 *   4. If `PUBLIC_BASE_URL` is set in env → idempotently create-or-update
 *      the repo webhook pointing at `<PUBLIC_BASE_URL>/webhooks/github`
 *      with the right events and secret. Skipped with a warn otherwise.
 *
 * Run with: `npm run seed:github`
 */
// MUST be the first import — populates process.env from the repo-root .env
// before any code reads GITHUB_* / DATABASE_URL / etc.
import './_load-env';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface GithubRepo {
  full_name: string;
  default_branch: string;
  permissions?: { admin: boolean; push: boolean; pull: boolean };
}

interface GithubHook {
  id: number;
  events: string[];
  active: boolean;
  config: { url: string; content_type: string };
}

const WEBHOOK_EVENTS = ['push', 'pull_request', 'pull_request_review'];

async function ghRequest<T = unknown>(
  path: string,
  token: string,
  init: RequestInit & { expectScopes?: boolean } = {},
): Promise<{ body: T; scopes: string }> {
  const { expectScopes, ...rest } = init;
  const res = await fetch(`https://api.github.com${path}`, {
    ...rest,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      ...(rest.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  }
  const body = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  return {
    body,
    scopes: expectScopes ? res.headers.get('x-oauth-scopes') ?? '' : '',
  };
}

// Backwards-compatible alias used by the original validation code below
async function ghGet<T>(
  path: string,
  token: string,
  expectScopes = false,
): Promise<{ body: T; scopes: string }> {
  return ghRequest<T>(path, token, { expectScopes });
}

/**
 * Defensive parser: accepts plain values OR full GitHub URLs in either env var
 * and returns a normalized `{ owner, repo }` pair.
 */
function parseSlug(
  ownerRaw: string,
  repoRaw: string,
): { owner: string; repo: string } {
  const fromUrl = (value: string): { owner: string; repo: string } | null => {
    const m = value.match(/github\.com[/:]([^/]+)\/([^/.\s]+)/i);
    if (!m) return null;
    return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  };
  return (
    fromUrl(repoRaw) ??
    fromUrl(ownerRaw) ?? { owner: ownerRaw, repo: repoRaw }
  );
}

async function main(): Promise<void> {
  const ownerRaw = process.env.GITHUB_OWNER;
  const repoRaw = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!ownerRaw || !repoRaw || !token) {
    throw new Error('Missing GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN');
  }

  const { owner, repo } = parseSlug(ownerRaw, repoRaw);

  if (owner !== ownerRaw || repo !== repoRaw) {
    console.log(
      `[github-seed] normalized GITHUB_OWNER/REPO from URL → ${owner}/${repo}`,
    );
    console.log(
      `[github-seed] tip: set GITHUB_OWNER=${owner} and GITHUB_REPO=${repo} in .env`,
    );
  }

  console.log(`[github-seed] validating ${owner}/${repo}`);

  // 1. Token scopes
  const { scopes } = await ghGet<unknown>('/user', token, true);
  if (scopes) {
    console.log(`[github-seed] token scopes: ${scopes}`);
    if (!scopes.includes('repo')) {
      console.warn(
        '[github-seed] WARNING: token may lack `repo` scope — branch creation will fail',
      );
    }
  }

  // 2. Repo exists & is accessible
  const { body: repoInfo } = await ghGet<GithubRepo>(
    `/repos/${owner}/${repo}`,
    token,
  );
  console.log(`[github-seed] repo: ${repoInfo.full_name}`);
  console.log(`[github-seed] repo default_branch: ${repoInfo.default_branch}`);

  // 3. Configured base branch exists
  const config = await prisma.systemConfig.findUnique({
    where: { key: 'default_base_branch' },
  });
  const baseBranch = config?.value ?? repoInfo.default_branch;

  try {
    await ghGet(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(baseBranch)}`,
      token,
    );
    console.log(`[github-seed] base branch "${baseBranch}" exists`);
  } catch (err) {
    throw new Error(
      `Base branch "${baseBranch}" not found in ${owner}/${repo}: ${(err as Error).message}`,
    );
  }

  // 4. Auto-install / update the webhook (only if PUBLIC_BASE_URL is set)
  await ensureWebhook({ owner, repo, token });

  console.log('[github-seed] done');
}

async function ensureWebhook(args: {
  owner: string;
  repo: string;
  token: string;
}): Promise<void> {
  const baseUrl = (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/$/, '');
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? '';

  if (!baseUrl) {
    console.warn(
      '[github-seed] PUBLIC_BASE_URL is empty — skipping webhook auto-install.',
    );
    console.warn(
      '[github-seed] Set PUBLIC_BASE_URL to your tunnel URL (VS Code Dev Tunnels / ngrok) and re-run to install.',
    );
    return;
  }
  if (!secret) {
    console.warn(
      '[github-seed] GITHUB_WEBHOOK_SECRET is empty — skipping webhook auto-install.',
    );
    return;
  }

  const webhookUrl = `${baseUrl}/webhooks/github`;

  // Defensive validation — catch malformed URLs locally before sending to
  // GitHub (which would otherwise reject with a cryptic 422). The most
  // common cause is leftover quotes or `;` from pasting JS into .env.
  try {
    const parsed = new URL(webhookUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`unsupported protocol "${parsed.protocol}"`);
    }
  } catch (err) {
    console.error(
      `[github-seed] PUBLIC_BASE_URL produces an invalid webhook URL: "${webhookUrl}"`,
    );
    console.error(
      `[github-seed] Reason: ${(err as Error).message}`,
    );
    console.error(
      `[github-seed] Tip: in .env, write the value WITHOUT quotes or trailing semicolons.`,
    );
    console.error(
      `[github-seed] Correct: PUBLIC_BASE_URL=https://your-tunnel.example.com`,
    );
    return;
  }

  const desiredConfig = {
    url: webhookUrl,
    content_type: 'json',
    secret,
    insecure_ssl: '0',
  };

  console.log(`[github-seed] ensuring webhook for ${webhookUrl}…`);

  let existing: GithubHook[];
  try {
    const res = await ghRequest<GithubHook[]>(
      `/repos/${args.owner}/${args.repo}/hooks`,
      args.token,
    );
    existing = res.body;
  } catch (err) {
    console.error(
      `[github-seed] Failed to list webhooks: ${(err as Error).message}`,
    );
    console.error(
      `[github-seed] Make sure the token has \`Webhooks: Read and write\` permission (fine-grained PAT) or \`admin:repo_hook\` scope (classic PAT).`,
    );
    return;
  }

  const match = existing.find((h) => h.config.url === webhookUrl);

  if (match) {
    const sameEvents =
      match.events.length === WEBHOOK_EVENTS.length &&
      match.events.every((e) => WEBHOOK_EVENTS.includes(e));
    if (sameEvents && match.active && match.config.content_type === 'json') {
      // Refresh the secret in case it was rotated locally
      await ghRequest(
        `/repos/${args.owner}/${args.repo}/hooks/${match.id}/config`,
        args.token,
        { method: 'PATCH', body: JSON.stringify(desiredConfig) },
      );
      console.log(
        `[github-seed] webhook already configured (id=${match.id}) — secret refreshed`,
      );
      return;
    }

    // Update the existing hook with the desired config + events
    await ghRequest(
      `/repos/${args.owner}/${args.repo}/hooks/${match.id}`,
      args.token,
      {
        method: 'PATCH',
        body: JSON.stringify({
          active: true,
          events: WEBHOOK_EVENTS,
          config: desiredConfig,
        }),
      },
    );
    console.log(`[github-seed] webhook updated (id=${match.id})`);
    return;
  }

  // Create a brand-new hook
  const created = await ghRequest<GithubHook>(
    `/repos/${args.owner}/${args.repo}/hooks`,
    args.token,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: WEBHOOK_EVENTS,
        config: desiredConfig,
      }),
    },
  );
  console.log(`[github-seed] webhook created (id=${created.body.id})`);
}

main()
  .catch((err) => {
    console.error('[github-seed] FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
