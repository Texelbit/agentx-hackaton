#!/usr/bin/env node
/**
 * One-shot project bootstrap.
 *
 * Usage:  npm run init
 *
 * What it does (idempotent — safe to re-run):
 *   1. Verifies Node >= 20
 *   2. Copies .env.example → .env if missing
 *   3. Generates an RS256 JWT keypair via Node crypto (no openssl required)
 *      and injects the base64 PEMs into .env
 *   4. Runs `npm install` across all workspaces
 *   5. Builds the shared packages (llm-client, agent-core, tool-use, shared-types)
 *   6. Generates the Prisma client
 *   7. Enables pgvector on the configured database (CREATE EXTENSION)
 *   8. Applies Prisma migrations
 *   9. Runs the bootstrap seed (roles, super-admin, priorities, llm_configs, ...)
 *  10. Validates Jira / GitHub when their env vars look real
 *  11. Indexes the source codebase: clones ECOMMERCE_REF_REPO_URL into a temp
 *      folder, runs the indexer (embeddings → pgvector), then DELETES the
 *      temp folder. The codebase never lives inside this repo.
 *  12. Prints clear next-steps
 *
 * Cross-platform: runs on macOS, Linux and Windows. Uses Node APIs only.
 */

import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Paths ──────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const BACKEND_DIR = join(ROOT, 'apps', 'backend');
const ENV_FILE = join(ROOT, '.env');
const ENV_EXAMPLE = join(ROOT, '.env.example');
const PGVECTOR_SQL = join(BACKEND_DIR, 'prisma', 'init.sql');
const DEFAULT_REPO_URL = 'https://github.com/reactioncommerce/reaction';

// ── Tiny logger ────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function step(n, total, msg) {
  console.log(`\n${c.cyan}${c.bold}[${n}/${total}]${c.reset} ${c.bold}${msg}${c.reset}`);
}
function info(msg)  { console.log(`  ${c.dim}${msg}${c.reset}`); }
function ok(msg)    { console.log(`  ${c.green}✓${c.reset} ${msg}`); }
function warn(msg)  { console.log(`  ${c.yellow}!${c.reset} ${msg}`); }
function fail(msg)  { console.log(`  ${c.red}✗${c.reset} ${msg}`); }

// ── Helpers ────────────────────────────────────────────────────────────

function which(cmd) {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    stdio: 'ignore',
  });
  return probe.status === 0;
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

/**
 * Run a command and return its result without throwing on non-zero. Used
 * by optional steps where we prefer a warn() over hard failure.
 */
function runSoft(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  return result.status === 0;
}

function readEnv() {
  if (!existsSync(ENV_FILE)) return {};
  const lines = readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  const map = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) map[m[1]] = sanitizeEnvValue(m[2]);
  }
  return map;
}

/**
 * Strips JS-isms users sometimes paste into .env: trailing semicolons,
 * surrounding quotes (matched OR mismatched), surrounding whitespace.
 * .env values are raw strings — no quoting / no terminators needed.
 */
function sanitizeEnvValue(raw) {
  let value = raw.trim();
  while (value.endsWith(';')) value = value.slice(0, -1).trimEnd();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/^["']+/, '').replace(/["']+$/, '');
  }
  return value;
}

/**
 * Loads the parsed .env into `process.env` so every child process spawned
 * by the init script inherits the variables. This is critical because:
 *
 *   - `prisma db execute` and `prisma migrate` look for `.env` in the cwd
 *     (which we set to `apps/backend/`), not the repo root
 *   - The seed scripts that boot a NestJS context need every var Joi validates
 *
 * Existing values in `process.env` win over .env values, so the user can
 * still override anything via shell exports if needed.
 */
function loadEnvIntoProcess() {
  const fileEnv = readEnv();
  let added = 0;
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      added++;
    }
  }
  return added;
}

function writeEnv(map) {
  const original = existsSync(ENV_FILE)
    ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)
    : [];

  const seen = new Set();
  const out = original.map((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (m && map[m[1]] !== undefined) {
      seen.add(m[1]);
      return `${m[1]}=${map[m[1]]}`;
    }
    return line;
  });

  for (const [k, v] of Object.entries(map)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }

  writeFileSync(ENV_FILE, out.join('\n'));
}

/**
 * Detect placeholder values still living in .env. Anything that starts with
 * a known sentinel string from .env.example counts as "not set".
 */
function isReal(value) {
  if (!value) return false;
  const placeholderPrefixes = [
    'your_',
    'your-',
    'sk-proj-your',
    'ghp_your',
    'base64_encoded',
    'change-me',
    'admin@yourdomain',
  ];
  const lowered = value.toLowerCase();
  if (placeholderPrefixes.some((p) => lowered.startsWith(p.toLowerCase()))) return false;
  if (lowered.includes('your-project.supabase.co')) return false;
  if (lowered.includes('your-org.atlassian.net')) return false;
  if (lowered.includes('your_github_owner')) return false;
  if (lowered.includes('hooks.slack.com/services/t...')) return false;
  return true;
}

// ── Steps ──────────────────────────────────────────────────────────────

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    fail(`Node.js 20+ required. You are running ${process.versions.node}`);
    process.exit(1);
  }
  ok(`Node ${process.versions.node}`);
}

function ensureEnv() {
  if (existsSync(ENV_FILE)) {
    const added = loadEnvIntoProcess();
    ok(`.env already exists — loaded ${added} variables into process.env`);
    return;
  }
  if (!existsSync(ENV_EXAMPLE)) {
    fail('.env.example missing — cannot bootstrap');
    process.exit(1);
  }
  copyFileSync(ENV_EXAMPLE, ENV_FILE);
  loadEnvIntoProcess();
  ok('Created .env from .env.example');
  warn('Remember to fill in real credentials before running the backend');
}

function ensureJwtKeys() {
  const env = readEnv();
  const hasPrivate = env.JWT_PRIVATE_KEY && !env.JWT_PRIVATE_KEY.includes('base64_encoded');
  const hasPublic = env.JWT_PUBLIC_KEY && !env.JWT_PUBLIC_KEY.includes('base64_encoded');

  if (hasPrivate && hasPublic) {
    ok('JWT_PRIVATE_KEY / JWT_PUBLIC_KEY already set in .env');
    return;
  }

  info('Generating RS256 keypair via Node crypto…');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  env.JWT_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');
  env.JWT_PUBLIC_KEY = Buffer.from(publicKey).toString('base64');
  writeEnv(env);
  ok('Wrote JWT_PRIVATE_KEY and JWT_PUBLIC_KEY (base64 PEM) to .env');
}

function installDependencies() {
  info('Running `npm install` across all workspaces (this may take a few minutes)…');
  run('npm', ['install']);
  ok('Dependencies installed');
}

function generatePrismaClient() {
  info('Generating Prisma client (apps/backend)…');
  run('npm', ['run', 'prisma:generate', '--workspace=apps/backend']);
  ok('Prisma client generated');
}

/**
 * Builds ONLY the four shared packages — never the apps. Apps are built
 * by their own dev/start scripts (`nest start`, `vite`) or by docker.
 *
 * Using `npm run build --workspaces --if-present` would also build the
 * backend and the two frontends, which is wrong: the backend imports from
 * `@prisma/client` and that import only resolves after `prisma generate`
 * has produced the client; the frontends only need to be served in dev mode.
 * We intentionally keep init focused on the bare minimum needed to run
 * `npm run dev:backend` / `dev:report` / `dev:dashboard` later.
 */
function buildSharedPackages() {
  const packages = [
    '@sre/llm-client',
    '@sre/agent-core',
    '@sre/tool-use',
    '@sre/shared-types',
  ];
  for (const pkg of packages) {
    info(`Building ${pkg}…`);
    run('npm', ['run', 'build', `--workspace=${pkg}`]);
  }
  ok('Shared packages built');
}

// ── DB steps (skipped when DATABASE_URL is still a placeholder) ────────

function enablePgvector() {
  const env = readEnv();
  if (!isReal(env.DATABASE_URL)) {
    warn('DATABASE_URL still a placeholder — skipping pgvector + migrations + seeds');
    warn('Fill it in .env and re-run `npm run init` when ready');
    return false;
  }

  info(`Enabling pgvector via prisma db execute (${PGVECTOR_SQL})…`);
  const ok1 = runSoft(
    'npx',
    [
      'prisma',
      'db',
      'execute',
      '--file',
      PGVECTOR_SQL,
      '--schema',
      './prisma/schema.prisma',
    ],
    { cwd: BACKEND_DIR },
  );
  if (!ok1) {
    fail('Failed to enable pgvector. Check that DATABASE_URL is reachable.');
    return false;
  }
  ok('pgvector extension enabled');
  return true;
}

function applyMigrations() {
  info('Applying Prisma migrations…');
  const migrationsDir = join(BACKEND_DIR, 'prisma', 'migrations');
  if (!existsSync(migrationsDir)) {
    info('No migrations folder found — running `prisma migrate dev --name init`');
    const success = runSoft(
      'npx',
      ['prisma', 'migrate', 'dev', '--name', 'init', '--skip-seed'],
      { cwd: BACKEND_DIR },
    );
    if (!success) {
      fail('prisma migrate dev failed');
      return false;
    }
  } else {
    const success = runSoft('npm', ['run', 'prisma:migrate:deploy', '--workspace=apps/backend']);
    if (!success) {
      fail('prisma migrate deploy failed');
      return false;
    }
  }
  ok('Migrations applied');
  return true;
}

function runBootstrapSeed() {
  const env = readEnv();
  if (!isReal(env.BOOTSTRAP_ADMIN_EMAIL) || !isReal(env.BOOTSTRAP_ADMIN_PASSWORD)) {
    warn('BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set — skipping bootstrap seed');
    return false;
  }
  info('Seeding roles, permissions, super-admin, priorities, branch rules…');
  const success = runSoft('npm', ['run', 'seed:bootstrap', '--workspace=apps/backend']);
  if (!success) {
    fail('Bootstrap seed failed');
    return false;
  }
  ok('Bootstrap seed complete');
  return true;
}

function runOptionalSeed(label, requiredKeys, scriptName) {
  const env = readEnv();
  const missing = requiredKeys.filter((k) => !isReal(env[k]));
  if (missing.length > 0) {
    warn(`Skipping ${label} — missing/placeholder env: ${missing.join(', ')}`);
    return;
  }
  info(`Running ${label}…`);
  const success = runSoft('npm', ['run', scriptName, '--workspace=apps/backend']);
  if (success) {
    ok(`${label} complete`);
  } else {
    warn(`${label} failed (continuing — you can re-run it later)`);
  }
}

// ── Codebase indexing (clone → index → cleanup) ────────────────────────

/**
 * Indexes the source repo into pgvector WITHOUT keeping a copy on disk.
 *
 *   1. If `ECOMMERCE_REF_PATH` is already set in .env, use that folder as-is
 *      (opt-out for users who already have the repo cloned somewhere they
 *      want to keep).
 *   2. Otherwise clone `ECOMMERCE_REF_REPO_URL` into an OS temp folder.
 *   3. Spawn the indexer with `ECOMMERCE_REF_PATH=<temp>` overridden in the
 *      child process env (no .env mutation).
 *   4. Delete the temp folder — always, even if indexing failed.
 *
 * Requires `OPENAI_API_KEY` to compute embeddings — skips with a clear warn
 * if it's still a placeholder.
 */
function indexCodebaseFromRemote() {
  const env = readEnv();

  if (!isReal(env.OPENAI_API_KEY)) {
    warn('Skipping codebase indexing — OPENAI_API_KEY not set (needed for embeddings)');
    return;
  }

  // Opt-out: user already has a folder they want to use
  const existingPath = env.ECOMMERCE_REF_PATH?.trim();
  if (existingPath) {
    info(`ECOMMERCE_REF_PATH is set (${existingPath}) — using that instead of cloning`);
    const success = spawnIndexer(existingPath);
    if (success) ok('Indexing complete');
    else warn('Indexing failed — re-run later if needed');
    return;
  }

  if (!which('git')) {
    warn('git not found in PATH — skipping codebase indexing');
    return;
  }

  const repoUrl = env.ECOMMERCE_REF_REPO_URL?.trim() || DEFAULT_REPO_URL;
  const tempDir = mkdtempSync(join(tmpdir(), 'sre-agent-source-'));
  info(`Cloning ${repoUrl} → ${tempDir}`);
  info('(temporary folder, will be deleted after indexing)');

  try {
    const cloneOk = runSoft('git', ['clone', '--depth', '1', repoUrl, tempDir]);
    if (!cloneOk) {
      warn('git clone failed — skipping indexing');
      return;
    }
    ok('Source repo cloned');

    info('Running indexer (embeddings → pgvector)…');
    const indexOk = spawnIndexer(tempDir);
    if (indexOk) {
      ok('Codebase indexed into rag_documents');
    } else {
      warn('Indexer reported a failure — re-run later if needed');
    }
  } finally {
    // ALWAYS clean up — even on failure
    try {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
      ok('Temporary clone deleted from disk');
    } catch (err) {
      warn(`Could not delete ${tempDir}: ${err.message}`);
      warn('You may need to remove it manually');
    }
  }
}

/**
 * Spawns `seed:indexer` with ECOMMERCE_REF_PATH overridden in the child env.
 * The override is process-scoped — it does NOT mutate the user's .env file.
 */
function spawnIndexer(path) {
  return runSoft('npm', ['run', 'seed:indexer', '--workspace=apps/backend'], {
    env: { ...process.env, ECOMMERCE_REF_PATH: path },
  });
}

// ── Final summary ──────────────────────────────────────────────────────

function printNextSteps(dbReady) {
  console.log(`\n${c.green}${c.bold}✅ Project initialized!${c.reset}\n`);
  console.log(`${c.bold}What's next:${c.reset}\n`);

  if (!dbReady) {
    console.log(`  ${c.yellow}!${c.reset} ${c.bold}Database not configured yet.${c.reset}`);
    console.log(`     ${c.dim}Edit .env → fill DATABASE_URL (Supabase) and BOOTSTRAP_ADMIN_*${c.reset}`);
    console.log(`     ${c.dim}Then re-run:  ${c.bold}npm run init${c.reset}\n`);
  }

  console.log(`  ${c.cyan}•${c.reset} Fill any remaining placeholders in ${c.bold}.env${c.reset}:`);
  console.log(`     ${c.dim}- GEMINI_API_KEY, OPENAI_API_KEY${c.reset}`);
  console.log(`     ${c.dim}- JIRA_* (base url, email, token, project key, webhook secret)${c.reset}`);
  console.log(`     ${c.dim}- GITHUB_* (token, owner, repo, webhook secret)${c.reset}`);
  console.log(`     ${c.dim}- RESEND_API_KEY, SLACK_WEBHOOK_URL${c.reset}`);
  console.log(`     ${c.dim}- ECOMMERCE_REF_REPO_URL  ${c.dim}(default: Reaction Commerce)${c.reset}`);
  console.log();
  console.log(`  ${c.cyan}•${c.reset} Re-run ${c.bold}npm run init${c.reset} after each integration to seed/validate it`);
  console.log();
  console.log(`  ${c.cyan}•${c.reset} Start the backend:`);
  console.log(`     ${c.bold}npm run dev:backend${c.reset}    ${c.dim}# http://localhost:3000${c.reset}`);
  console.log(`     ${c.dim}or:${c.reset} ${c.bold}docker compose up --build${c.reset}`);
  console.log();
  console.log(`  ${c.cyan}•${c.reset} Start the frontends:`);
  console.log(`     ${c.bold}npm run dev:report${c.reset}    ${c.dim}# http://localhost:5173${c.reset}`);
  console.log(`     ${c.bold}npm run dev:dashboard${c.reset} ${c.dim}# http://localhost:5174${c.reset}`);
  console.log();
  console.log(`  ${c.cyan}•${c.reset} Swagger UI: ${c.bold}http://localhost:3000/api/docs${c.reset}`);
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`${c.bold}${c.blue}╔══════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.blue}║   SRE Agent — Project Initialization     ║${c.reset}`);
  console.log(`${c.bold}${c.blue}╚══════════════════════════════════════════╝${c.reset}`);

  // Hard local steps — fail on any error.
  // generatePrismaClient runs BEFORE buildSharedPackages so the seeds (which
  // import from @prisma/client) always have a generated client to load.
  const hardSteps = [
    ['Checking Node.js version', checkNodeVersion],
    ['Ensuring .env file', ensureEnv],
    ['Ensuring JWT RS256 keypair', ensureJwtKeys],
    ['Installing workspace dependencies', installDependencies],
    ['Generating Prisma client', generatePrismaClient],
    ['Building shared packages', buildSharedPackages],
  ];

  // Soft DB steps — skipped if DATABASE_URL is a placeholder
  const dbSteps = [
    ['Enabling pgvector extension', enablePgvector],
    ['Applying Prisma migrations', applyMigrations],
    ['Seeding database (bootstrap)', runBootstrapSeed],
  ];

  // Optional integrations
  const optionalSteps = [
    {
      label: 'Validating Jira project',
      runner: () =>
        runOptionalSeed(
          'Validating Jira project',
          ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY'],
          'seed:jira',
        ),
    },
    {
      label: 'Validating GitHub repo',
      runner: () =>
        runOptionalSeed(
          'Validating GitHub repo',
          ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'],
          'seed:github',
        ),
    },
    {
      label: 'Indexing source codebase (clone → index → cleanup)',
      runner: () => indexCodebaseFromRemote(),
    },
  ];

  const total = hardSteps.length + dbSteps.length + optionalSteps.length;
  let current = 0;

  for (const [label, fn] of hardSteps) {
    current++;
    step(current, total, label);
    try { fn(); } catch (err) {
      fail(`${label} failed: ${err.message}`);
      process.exit(1);
    }
  }

  let dbReady = true;
  for (const [label, fn] of dbSteps) {
    current++;
    step(current, total, label);
    try {
      const success = fn();
      if (success === false) {
        dbReady = false;
        break;
      }
    } catch (err) {
      fail(`${label} failed: ${err.message}`);
      dbReady = false;
      break;
    }
  }

  for (const opt of optionalSteps) {
    current++;
    step(current, total, opt.label);
    if (!dbReady) {
      warn('Skipping — database not initialized yet');
      continue;
    }
    try {
      opt.runner();
    } catch (err) {
      warn(`${opt.label} failed: ${err.message}`);
    }
  }

  printNextSteps(dbReady);
}

main().catch((err) => {
  console.error(`\n${c.red}${c.bold}Initialization failed:${c.reset}`, err);
  process.exit(1);
});
