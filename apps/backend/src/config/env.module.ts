import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { EnvConfig } from './env.config';
import { envValidationSchema } from './env.validation';

/**
 * Resolves the path to the repo-root `.env` file regardless of the cwd
 * the backend was launched from.
 *
 *   - `npm run dev:backend` from the repo root → cwd is repo root → `.env`
 *   - `npm run dev` inside `apps/backend/`        → cwd is backend  → `../../.env`
 *   - `node dist/main.js` inside docker           → cwd is workspace → `/workspace/.env`
 */
const ROOT_ENV_FROM_BACKEND = resolve(__dirname, '../../../../.env');
const ENV_CANDIDATES = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  ROOT_ENV_FROM_BACKEND,
];

/**
 * Strips JS-isms users sometimes paste into .env: trailing semicolons,
 * surrounding whitespace, and surrounding quotes (matched OR mismatched).
 * .env values are raw strings — no quoting / no terminators needed.
 *
 * Mirrors the same helper in `prisma/seeds/_load-env.ts` and
 * `scripts/with-env.mjs` so every loader path applies the same rules.
 */
function sanitizeEnvValue(raw: string): string {
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
 * Eagerly preloads the repo-root `.env` into `process.env` with
 * sanitization, BEFORE `@nestjs/config`'s dotenv loader runs. This is
 * critical because dotenv reads values raw — Joi would then reject any
 * value that the user accidentally wrapped in quotes or terminated with
 * a semicolon (a JS habit some IDEs auto-apply).
 *
 * Existing `process.env` values win, so this never overwrites a real
 * shell export. Module-level execution guarantees it runs before
 * `ConfigModule.forRoot` triggers Joi validation downstream.
 */
function preloadEnv(): void {
  const envFile = ENV_CANDIDATES.find((p) => existsSync(p));
  if (!envFile) return;

  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = sanitizeEnvValue(m[2]);
    }
  }
}

// Run at module load time — BEFORE the @Module decorator below evaluates
// `ConfigModule.forRoot`, which is what triggers Joi validation.
preloadEnv();

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Multiple candidates so the backend works whether launched from the
      // repo root, the backend folder, or inside a docker container.
      envFilePath: ['.env', '../../.env', ROOT_ENV_FROM_BACKEND],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
  ],
  providers: [EnvConfig],
  exports: [EnvConfig],
})
export class EnvModule {}
