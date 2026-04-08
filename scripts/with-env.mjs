#!/usr/bin/env node
/**
 * Tiny wrapper that loads the repo-root `.env` into `process.env` and then
 * spawns whatever command + args were passed in. Used by the backend's
 * prisma scripts so they work no matter the cwd.
 *
 * Why this exists:
 *   - Prisma CLI looks for `.env` relative to the cwd (or schema folder),
 *     not the repo root
 *   - When npm runs a workspace script the cwd is `apps/backend/`, so
 *     Prisma can't find the root `.env`
 *   - This wrapper bridges the gap with zero external dependencies
 *
 * Usage:
 *   node ../../scripts/with-env.mjs <command> [...args]
 *
 * Example (from apps/backend/package.json):
 *   "prisma:migrate": "node ../../scripts/with-env.mjs prisma migrate dev"
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = resolve(__dirname, '..', '.env');

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

if (existsSync(ROOT_ENV)) {
  const content = readFileSync(ROOT_ENV, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = sanitizeEnvValue(m[2]);
    }
  }
} else {
  console.warn(`[with-env] Warning: ${ROOT_ENV} not found`);
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Usage: node with-env.mjs <command> [...args]');
  process.exit(1);
}

const result = spawnSync(cmd, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

process.exit(result.status ?? 1);
