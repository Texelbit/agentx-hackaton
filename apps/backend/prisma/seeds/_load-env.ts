/**
 * Self-loader for the repo-root `.env` file.
 *
 * Each seed script imports this module as its FIRST import so the seeds can
 * be run standalone (`npm run seed:jira`) without relying on `npm run init`
 * to pre-populate `process.env`.
 *
 * Why this exists:
 * - The `.env` file lives at the repo root, not inside `apps/backend/`
 * - When npm runs a workspace script its cwd is the workspace folder
 * - dotenv (and Prisma's built-in env loader) look for `.env` in the cwd,
 *   so they would miss the root file
 * - This helper walks up from `apps/backend/prisma/seeds/` to the repo root
 *   and loads the file via plain Node fs APIs (zero dependencies)
 *
 * Existing values in `process.env` win — shell exports always take priority.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT_ENV = resolve(__dirname, '../../../../.env');

if (existsSync(ROOT_ENV)) {
  const content = readFileSync(ROOT_ENV, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const value = sanitizeEnvValue(m[2]);
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = value;
    }
  }
}

/**
 * Strips JS-isms users sometimes paste into .env files: trailing semicolons,
 * surrounding whitespace, and surrounding quotes (matched OR mismatched).
 * Real .env values are raw strings — no quoting / no terminators needed.
 */
function sanitizeEnvValue(raw: string): string {
  let value = raw.trim();
  // Remove trailing `;` (a JS habit some IDEs add automatically)
  while (value.endsWith(';')) value = value.slice(0, -1).trimEnd();
  // Strip a surrounding pair of quotes if symmetric
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  } else {
    // Otherwise strip any leading/trailing stray quote characters that
    // survived (mismatched quoting).
    value = value.replace(/^["']+/, '').replace(/["']+$/, '');
  }
  return value;
}
