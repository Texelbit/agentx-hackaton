# SRE Agent — Backend Handoff

> **Audience:** any future agent (or human) picking up this codebase.
> **Goal:** know what already exists so you don't duplicate or rewrite.

The full product spec lives in [SRE_AGENT_SPEC.md](SRE_AGENT_SPEC.md).
**Always read the spec first** before making architectural decisions.

---

## Repo layout (current state)

```
/
├── package.json                      # npm workspaces root
├── tsconfig.base.json                # shared TS config
├── docker-compose.yml                # single-command boot
├── .env.example                      # full env template
├── SRE_AGENT_SPEC.md                 # source of truth
├── HANDOFF.md                        # this file
│
├── packages/
│   ├── llm-client/                   # @sre/llm-client (DONE)
│   ├── agent-core/                   # @sre/agent-core (DONE)
│   └── tool-use/                     # @sre/tool-use   (DONE)
│
└── apps/
    ├── backend/                      # NestJS + Prisma (DONE — see modules below)
    ├── dashboard-web/                # NOT YET BUILT (see "Pending work")
    └── report-web/                   # NOT YET BUILT (see "Pending work")
```

---

## What is DONE

### Packages (`packages/*`)

| Package | Key exports | Notes |
|---------|-------------|-------|
| **`@sre/llm-client`** | `LlmClient`, `LlmStrategy`, `LlmMessage`, `LlmMessageRole`, `LlmProvider`, `GeminiStrategy`, `OpenAIStrategy`, `AnthropicStrategy`, `LlmCapabilityError` | Strategy pattern. Each strategy implements `complete`, `stream`, `embed`. Multimodal supported via `LlmAttachment`. |
| **`@sre/agent-core`** | `BaseAgent` (template method), `BaseConversationalAgent`, `AgentRole`, `ILlmConfigResolver`, `ConversationTurn`, `IAgentFactory` | Pure abstractions, zero NestJS deps. Backend implements `ILlmConfigResolver` via `LlmConfigService`. |
| **`@sre/tool-use`** | `Tool<TInput,TOutput>`, `ToolRegistry`, `ToolNotFoundError` | Not yet wired into any agent — available for future tool-use agents. |

### Backend modules (`apps/backend/src/*`)

Every module below already exists, is registered in `app.module.ts`, and is wired with the Prisma schema in [apps/backend/prisma/schema.prisma](apps/backend/prisma/schema.prisma). **Do NOT recreate any of these.**

| Module path | Key classes | Provides |
|-------------|-------------|----------|
| `prisma/` | `PrismaService`, `PrismaModule` (`@Global`) | DI wrapper around `PrismaClient` |
| `config/` | `EnvConfig`, `EnvModule` (`@Global`), `envValidationSchema` (Joi) | Strongly-typed env access |
| `common/enums/` | `Permission` enum + re-exports of every Prisma enum | Single source of truth for domain enums |
| `common/constants/` | `SystemConfigKey` typed constants | Avoids magic strings into `system_config` |
| `common/filters/` | `GlobalExceptionFilter` | Maps HttpException + Prisma errors |
| `common/interceptors/` | `LoggingInterceptor` | JSON request logs |
| `common/utils/` | `SlugUtil` (kebab + Pascal), `HashUtil` (bcrypt + sha256 + hmac + safeEqual) | Centralized crypto / slug helpers |
| `llm-client/` | `LlmClientModule` (`@Global`), token `LLM_CLIENT` | Factory that registers Gemini/OpenAI/Anthropic strategies |
| `auth/` | `AuthService`, `TokenService`, `AuthController`, `JwtAuthGuard`, `RbacGuard` (both global via `APP_GUARD`), `JwtStrategy`, decorators: `@Public()`, `@CurrentUser()`, `@RequirePermission(Permission.X)` | JWT RS256 + refresh rotation. **No `/auth/register`** (closed). |
| `users/` | `UsersService`, `UsersRepository`, `UsersController`, DTOs (`UserDto`, `CreateUserDto`, `UpdateUserDto`, `ChangeRoleDto`, notification prefs DTOs) | Admin-only user creation, super-admin/admin protection rules, `UserDto.fromEntity` strips `passwordHash` |
| `priorities/` | `PrioritiesService`, `PrioritiesController`, DTOs | DB-backed priority catalog (CRITICAL/HIGH/MEDIUM/LOW/INFO) |
| `roles/` | `RolesService`, `RolesController`, DTOs | List + `updatePermissions` (transactional, blocks SUPER_ADMIN) |
| `system-config/` | `SystemConfigService` (`@Global`, 60s cache), `SystemConfigController` | Typed getters: `getDefaultBaseBranch`, `getSimilarityThreshold`, `getNotificationRateLimitSeconds`, `getBranchNamingPattern` |
| `llm-config/` | `LlmConfigService` (`@Global`, **implements `ILlmConfigResolver`**), `LlmConfigController` | DB-driven LLM provider/model assignment per `AgentRole` |
| `rag/` | `RagService` (only place that runs `$queryRaw` on pgvector), `IndexerService`, `RagModule` (`@Global`), `RagCollection` enum (TS-only) | `embed`, `upsertDocument`, `search`, `embedIncident`, `searchSimilarIncidents` |
| `chat/` | `ChatService`, `ChatRepository`, `ChatController` (SSE manual via `Response.write`), `IntakeAgent` (extends `BaseConversationalAgent`), `ExtractedIncident` interface, **bridge IoC token `INCIDENT_FROM_CHAT_CREATOR`** | Conversational intake with multimodal attachments. `IntakeAgent` uses `<<READY_TO_FINALIZE>>` sentinel. |
| `integrations/jira/` | `JiraService`, `JiraModule` (`@Global`) | REST v3 client: `getProjectStatuses`, `getIssueTransitions`, `createTicket`, `transitionIssue`, `ping` |
| `integrations/github/` | `GitHubService`, `GitHubModule` (`@Global`) | REST v3 client: `getRepoInfo`, `branchExists`, `createBranch`, `branchUrl` |
| `incidents/` | `IncidentsService` (**implements `IIncidentFromChatCreator`**), `IncidentsRepository`, `IncidentsController`, `SREAgent` (extends `BaseAgent`), `BranchNamingService`, `IncidentLinksService`, DTOs, **bridge tokens `INCIDENT_NOTIFIER` + `REALTIME_BROADCASTER`** | The big pipeline: `createFromChat` (7 steps), `applyStatusChange` (called by webhooks), `findAll/findMine/findOne` with reporter ownership check |
| `notifications/` | `NotificationsService` (**implements `IIncidentNotifier`**, `@Global`), `EmailObserver` (Resend), `SlackObserver`, `EmailComposerAgent` (extends `BaseAgent`, only used for `STATUS_DONE`), `NotificationRateLimiterService` (DB-backed via `notification_logs`), `NotificationPreferencesService` | Observer pattern via `Map<NotificationChannel, NotificationObserver>` |
| `webhooks/` | `WebhooksController`, `GitHubWebhookService`, `JiraWebhookService`, `WebhookHmacGuard` (uses `request.rawBody`) | Both endpoints `@Public()` + HMAC. `main.ts` enables `rawBody: true`. |
| `audit/` | `AuditService` (**implements `IAuditRecorder`**, `@Global`), `AuditRepository`, `AuditController`, **token `AUDIT_RECORDER`** | Audit log writes never block the originating action |
| `branch-rules/` | `BranchRulesService`, `BranchRulesController`, DTOs (`BranchRuleDto`, `CreateBranchRuleDto`, `UpdateBranchRuleDto`, `BranchRuleConditionDto`) | Full CRUD over `branch_state_rules`. On every create/update of a rule, eagerly resolves the matching `jiraStatusId` from `jira_status_mappings`. Also exposes `POST /config/branch-rules/resync-jira` to re-run the resolution across all rules after the user adds new statuses to their Jira project. The `BranchRulesManager` component in `apps/dashboard-web` consumes this CRUD. |
| `realtime/` | `RealtimeGateway` (**implements `IRealtimeBroadcaster`**, namespace `/realtime`, `@Global`), JWT verification on handshake, rooms `role:*` and `user:*` | Token bound: `REALTIME_BROADCASTER` |

### IoC bridges (very important — read before adding new modules)

The backend uses **IoC tokens** to keep modules decoupled. The provider always uses `useExisting` so the same instance satisfies both the concrete class and the bridge.

| Token | Defined in | Implemented by | Consumed by |
|-------|------------|----------------|-------------|
| `INCIDENT_FROM_CHAT_CREATOR` | `chat/interfaces/incident-from-chat-creator.interface.ts` | `IncidentsService` (incidents.module.ts) | `ChatController.finalize` (with `@Optional()`) |
| `INCIDENT_NOTIFIER` | `incidents/interfaces/incident-notifier.interface.ts` | `NotificationsService` (notifications.module.ts) | `IncidentsService`, webhooks |
| `REALTIME_BROADCASTER` | `incidents/interfaces/realtime-broadcaster.interface.ts` | `RealtimeGateway` (realtime.module.ts) | `IncidentsService` (with `@Optional()`) |
| `AUDIT_RECORDER` | `audit/interfaces/audit-recorder.interface.ts` | `AuditService` (audit.module.ts) | `GitHubWebhookService`, `JiraWebhookService` (both with `@Optional()`) |

**Module load order** (important — see `app.module.ts`): audit/realtime/notifications must load before incidents, incidents before chat.

### Prisma schema highlights

[apps/backend/prisma/schema.prisma](apps/backend/prisma/schema.prisma) — **already complete**. Models:

- **Auth/RBAC**: `RoleEntity`, `Permission`, `RolePermission`, `User`, `RefreshToken`
- **Incidents**: `Priority`, `Incident` (with `Unsupported("vector(1536)")` embedding), `IncidentAttachment`, `IncidentLink`
- **Chat**: `ChatSession`, `ChatMessage`
- **Config**: `BranchStateRule`, `JiraStatusMapping`, `SystemConfig`, `LlmConfig`
- **Notifications**: `NotificationPreference`, `NotificationLog`
- **RAG**: `RagDocument`, `IndexingStatus`
- **Audit**: `AuditLog`

All Prisma enums are re-exported from `apps/backend/src/common/enums/index.ts`. **Do not redefine them** as TS enums elsewhere.

### Seeds

Located in [apps/backend/prisma/seeds/](apps/backend/prisma/seeds/):

| Seed | What it does |
|------|--------------|
| `bootstrap.seed.ts` | Idempotent. Inserts roles, permissions, role_permissions, super-admin from env, priorities, system_config, llm_configs, branch_state_rules, indexing_status |
| `jira.seed.ts` | **Discovery only** — never mutates Jira. Reads `JIRA_PROJECT_KEY`, fetches statuses, builds `JiraStatusMapping`, patches `BranchStateRule.jiraStatusId`. Exits non-zero with actionable error if a required status is missing. |
| `github.seed.ts` | Validates token + repo + base branch. No mutations. |
| `indexer.seed.ts` | Boots a Nest application context (no HTTP) and runs `IndexerService.indexCodebase` + `indexLogs` once. Skips work if `indexing_status` is already `DONE`. |

### Infra

- [docker-compose.yml](docker-compose.yml) — single backend service. Postgres is **external** (Supabase). Volumes mount `ecommerce-ref/` and `logs/`.
- [apps/backend/Dockerfile](apps/backend/Dockerfile) — multi-stage build, then `migrate deploy → seed:bootstrap → seed:jira → seed:github → seed:indexer → start`.
- [.env.example](.env.example) — every required env var with comments.

---

## What is PENDING

### Frontends — DONE

Both Vite + React 18 + TS + Tailwind + React Query + Zustand. They share types
via `packages/shared-types` (`@sre/shared-types`) — **never duplicate enums**
on the frontend side, import from there.

#### `packages/shared-types`
| Export | Notes |
|--------|-------|
| `Role`, `IncidentStatus`, `NotificationChannel`, `NotificationEvent`, `AgentRole`, `LlmProvider`, `IncidentLinkStatus`, `ChatMessageRole`, `Permission` | Mirror of backend enums |
| `TokenPair`, `UserDto`, `PriorityDto`, `IncidentDto`, `IncidentLinkDto`, `ChatAttachment`, `ChatMessageDto`, `ChatSessionDto`, `FinalizeResponseDto`, `RealtimeIncidentEvent` | DTO shapes |

#### `apps/report-web` — REPORTER chat UI
- `src/lib/api.ts` — axios + JWT interceptor + refresh rotation. `login()` decodes JWT to build the user. Refresh token in localStorage (hackathon shortcut — production = httpOnly cookie).
- `src/store/auth.store.ts` — zustand auth store
- `src/pages/LoginPage.tsx`
- `src/pages/ChatPage.tsx` — **the main page**. Bootstraps a chat session on mount, sends messages with text + base64 image attachments, **parses SSE frames manually** (`event: done` / `event: error` / `data: {delta}`), shows the streaming agent reply, watches for the `<<READY_TO_FINALIZE>>` sentinel and surfaces a green "Open ticket" button that calls `POST /chat/sessions/:id/finalize`.

#### `apps/dashboard-web` — ADMIN/ENGINEER dashboard
- `src/lib/api.ts` — same shape as report-web
- `src/lib/realtime.ts` — Socket.IO client singleton against `/realtime` namespace, JWT in `auth.token` handshake field
- `src/hooks/useRealtime.ts` — wires socket events into React Query cache invalidation (`invalidateQueries({queryKey: ['incidents']})`)
- `src/store/auth.store.ts` — zustand auth store with `hasPermission(perm)` and `isAdmin()` helpers
- `src/components/Layout.tsx` — sidebar navigation (Dashboard / Incidents / Admin if isAdmin)
- `src/components/Badge.tsx` — `StatusBadge` + `PriorityBadge`
- `src/pages/LoginPage.tsx`
- `src/pages/DashboardPage.tsx` — KPIs (open / in review / resolved) + recent incidents list
- `src/pages/IncidentsPage.tsx` — filterable table by status
- `src/pages/IncidentDetailPage.tsx` — full triage, similar incidents (with confirm/reject), Jira link, GitHub branch, manual status change buttons
- `src/pages/AdminPage.tsx` — tabs: Users / Priorities / System config / LLM config / Audit log

Both consume `VITE_API_URL` (defaults to `http://localhost:3000`).

**To run:**
```bash
npm install                     # installs all workspaces
npm run build:shared-types      # build the shared types package once
npm run dev:backend             # backend on http://localhost:3000
npm run dev:report              # report-web on http://localhost:5173
npm run dev:dashboard           # dashboard-web on http://localhost:5174
```

### Things deferred to later

- **Autonomous git pushes by agents** — explicitly out of scope for this version (see SRE_AGENT_SPEC.md §1).
- **Active monitoring / proactive alerting** — out of scope.
- **Multi-tenant** — out of scope.
- **CI/CD** — local `docker compose up` only.

### Polish items worth touching when time allows

- The bootstrap super-admin runs as a **seed**, not as `OnApplicationBootstrap`. If you want auto-bootstrap on every boot without docker-compose, wire it in `app.module.ts`.
- `IndexerService.indexCodebase` chunks at 2000 chars with no AST awareness. Could be smarter (chunk by function with `tree-sitter` or similar).
- `EmailComposerAgent` only fires on `STATUS_DONE`. Could be extended to other events if it adds value.
- The `NotificationRateLimiterService` uses a hard query — could move to Redis for sub-ms latency under load.
- No tests yet. Each module is structured to be testable: services depend on repositories which wrap Prisma, and IoC bridges use interfaces.

---

## Conventions to respect (NON-NEGOTIABLE)

1. **English everywhere.** Every label, enum value, seed string, error message, Swagger description, DTO field, comment. The Spec spells this out at the top.
2. **No magic strings.** Domain values go through TS enums or strongly typed unions. Permissions use `Permission` enum, statuses use Prisma-generated enums re-exported from `common/enums/`.
3. **Prisma is the only ORM.** Raw SQL is allowed only inside `RagService` for pgvector via `$queryRaw`. Everywhere else: Prisma Client through a `*Repository` class.
4. **No duplication of enums.** Re-export from `@prisma/client` via `common/enums/index.ts`. Only `Permission` is a hand-rolled TS enum.
5. **Crypto goes through `HashUtil`.** Never import `bcrypt` or `crypto` directly.
6. **Env access goes through `EnvConfig`.** Never inject `ConfigService` directly.
7. **System config reads go through `SystemConfigService` typed getters.** Never call `getRaw('default_base_branch')` with a string literal.
8. **Repository pattern.** Services never call `prisma.<model>.*` directly — they go through a `*Repository`.
9. **IoC bridges instead of cross-module imports** when a dependency would create a cycle or feel like overreach. The 4 existing bridges (above) are the canonical examples.
10. **`UserDto.fromEntity()` is the only way to expose a user.** It strips `passwordHash` — never bypass it.
11. **Guards are global.** `JwtAuthGuard` + `RbacGuard` are registered as `APP_GUARD`. Use `@Public()` to opt out.
12. **The intake/triage/email composer agents extend the base classes from `@sre/agent-core`.** Do not bypass `BaseAgent.run()` or `BaseConversationalAgent.streamReply()` — override the hooks instead.

---

## Quick start (for a fresh machine)

There is a single bootstrap script — `npm run init` — that does **everything**
local + DB + integrations. It is **idempotent** (safe to re-run after each
piece of `.env` is filled in).

```bash
git clone <repo>
cd agentx-hackaton

# 1. First run: creates .env, generates JWT keypair, installs deps,
#    builds packages, generates Prisma client. Skips DB + integrations
#    because env vars are still placeholders.
npm run init

# 2. Open .env and fill in DATABASE_URL + BOOTSTRAP_ADMIN_*
# 3. In Supabase SQL editor (one time):
#      CREATE EXTENSION IF NOT EXISTS vector;
#    (npm run init also runs this for you via `prisma db execute`)

# 4. Re-run init — now it does pgvector + migrations + bootstrap seed
npm run init

# 5. Fill in remaining placeholders one integration at a time
#    (GEMINI/OPENAI keys, JIRA_*, GITHUB_*, RESEND_*, SLACK_*) and re-run
npm run init   # ← each re-run picks up the new env vars and seeds them

# 6. Start everything
npm run dev:backend     # http://localhost:3000   (or: docker compose up --build)
npm run dev:report      # http://localhost:5173
npm run dev:dashboard   # http://localhost:5174

# 7. Swagger UI: http://localhost:3000/api/docs
#    → gated by login, signs you in via httpOnly cookie. Use the
#      BOOTSTRAP_ADMIN_EMAIL / _PASSWORD set in .env.
```

---

## `npm run init` — what each step does

The script lives at [scripts/init.mjs](scripts/init.mjs). Cross-platform
(macOS / Linux / Windows), zero external deps (uses only Node built-ins), and
**fully idempotent** — re-running it is the canonical way to "advance" the
setup as you fill in `.env`.

| Phase | Step | Idempotent behavior |
|-------|------|---------------------|
| **Local** | Verify Node ≥ 20 | Always runs |
| **Local** | Copy `.env.example → .env` | Skipped if `.env` already exists (does NOT overwrite) |
| **Local** | Generate JWT RS256 keypair via `crypto.generateKeyPairSync` | Skipped if keys are already real (not placeholder). Uses Node crypto so **no openssl required** — works on Windows out of the box |
| **Local** | `npm install` (workspaces) | Always runs |
| **Local** | Build `@sre/llm-client` + `agent-core` + `tool-use` + `shared-types` | Always runs (cheap) |
| **Local** | `prisma generate` | Always runs (cheap) |
| **DB** | `prisma db execute --file prisma/init.sql` (enables pgvector) | Idempotent (`CREATE EXTENSION IF NOT EXISTS`). Skipped if `DATABASE_URL` is a placeholder |
| **DB** | `prisma migrate dev --name init` (first run) or `migrate deploy` (later) | Detects `prisma/migrations/` to choose. Skipped if `DATABASE_URL` is a placeholder |
| **DB** | `seed:bootstrap` | All `upsert`. Skipped if `BOOTSTRAP_ADMIN_*` are placeholders |
| **Integration** | `seed:jira` | Skipped if any of `JIRA_BASE_URL/EMAIL/API_TOKEN/PROJECT_KEY` is a placeholder |
| **Integration** | `seed:github` | Skipped if any of `GITHUB_TOKEN/OWNER/REPO` is a placeholder |
| **Integration** | Clone `ECOMMERCE_REF_REPO_URL` → temp dir → run indexer → **delete temp dir** | Skipped if `OPENAI_API_KEY` is a placeholder. The indexer's own `runOnce` mechanism then no-ops if `indexing_status.CODEBASE = DONE` |

The placeholder-detection helper `isReal(value)` matches sentinels like
`your_`, `sk-proj-your`, `change-me`, `your-project.supabase.co`, etc. Anything
that still looks like the `.env.example` template counts as "not configured"
and triggers a skip with a clear warn.

### The codebase indexing flow (clone → index → cleanup)

This is the most opinionated piece. **The codebase the SRE Agent learns from
NEVER lives inside this repo.** Instead:

1. `init.mjs` reads `ECOMMERCE_REF_REPO_URL` from `.env` (default:
   `https://github.com/reactioncommerce/reaction`).
2. Creates an OS-temp folder via `mkdtempSync(join(tmpdir(), 'sre-agent-source-'))`.
3. `git clone --depth 1 <url> <tempDir>`.
4. Spawns `npm run seed:indexer --workspace=apps/backend` with
   `ECOMMERCE_REF_PATH=<tempDir>` overridden in the **child process env**
   (the user's `.env` file is NEVER mutated).
5. The indexer (`IndexerService.indexCodebase`) walks the temp dir, chunks
   `.js/.ts` files at ~2000 chars, embeds via OpenAI, writes to `rag_documents`.
6. **`finally { rmSync(tempDir, recursive: true, force: true })`** — the temp
   folder is deleted no matter what (success, failure, exception).

**Opt-out**: if you set `ECOMMERCE_REF_PATH=<absolute-path>` in `.env`, init
respects it and uses your existing folder instead of cloning. Useful if you
already have the repo cloned somewhere you want to keep.

To point at YOUR codebase (instead of Reaction Commerce):

```bash
ECOMMERCE_REF_REPO_URL=https://github.com/Texelbit/sre-agent-demo
```

---

## Swagger UI authentication

`/api/docs` is **gated by a login**. Anyone hitting it without a valid cookie
gets a tiny inline HTML login page (rendered by `SwaggerAuthMiddleware`). On
successful POST `/auth/login` the backend sets an `httpOnly` cookie called
`access_token` that mirrors the JWT, the page reloads, and Swagger UI loads
with `withCredentials: true` so every "Try it out" automatically sends the
cookie.

Implementation:

| File | Purpose |
|------|---------|
| `auth/strategies/jwt.strategy.ts` | Custom JWT extractor: `Authorization: Bearer` first, then `access_token` cookie. Exports `ACCESS_TOKEN_COOKIE` constant |
| `auth/auth.controller.ts` | `login` and `refresh` set the cookie via `res.cookie(ACCESS_TOKEN_COOKIE, ...)` (httpOnly + sameSite=lax + secure in prod). `logout` clears it |
| `swagger/swagger-auth.middleware.ts` | Gate middleware. Verifies the cookie via `JwtService.verify` (RS256). On failure serves the inline login HTML |
| `main.ts` | Wires `cookieParser()`, mounts `SwaggerAuthMiddleware` on `/api/docs` BEFORE `SwaggerModule.setup`, configures Swagger with `addCookieAuth('access_token')` and `swaggerOptions: { withCredentials: true, persistAuthorization: true }` |

The Bearer header path still works for the frontends and any non-browser
client — the cookie is purely additive.

---

## Integration setup notes

This section documents **every credential the system needs**: where to get
it, what permissions it requires, what the backend does with it, and the
security stance behind each choice. Read this before touching `.env`.

### Webhooks need a public HTTPS URL

GitHub and Jira can only deliver webhook events to a publicly reachable
HTTPS endpoint. The backend exposes `/webhooks/github` and `/webhooks/jira`,
but during local development `localhost:3000` is invisible to the outside
world. You need to expose it via a tunnel:

| Tool | How |
|------|-----|
| **VS Code Dev Tunnels** (recommended — zero install) | Open the Ports panel → "Forward a Port" → choose `3000` → set visibility to **Public** → copy the `https://...devtunnels.ms` URL |
| **ngrok** | `ngrok http 3000` → copy the `https://...ngrok-free.app` URL |
| **Cloudflare Tunnel** | `cloudflared tunnel --url http://localhost:3000` → copy URL |

Whatever tunnel you use, paste the **HTTPS URL** into `PUBLIC_BASE_URL` in
`.env`. The backend exposes typed getters for the resulting webhook URLs:

```ts
env.publicBaseUrl              // "https://hmkl21gb-3000.use2.devtunnels.ms"
env.githubWebhookCallbackUrl   // "<base>/webhooks/github"
env.jiraWebhookCallbackUrl     // "<base>/webhooks/jira"
```

#### GitHub: auto-installed via API ✨

Once `PUBLIC_BASE_URL` is set, **`seed:github` automatically creates or
updates the GitHub webhook for you** using the GitHub REST API. No clicking
around in repo Settings → Webhooks. The seed:

1. Lists existing hooks via `GET /repos/{owner}/{repo}/hooks`
2. Looks for one whose `config.url` matches `<base>/webhooks/github`
3. **If found** → PATCHes it to refresh events + secret + activate
4. **If not found** → POSTs a new hook with the right events + secret
5. Idempotent — re-runs are safe and skip work when nothing changed

Required token permission: **`Webhooks: Read and write`** on a fine-grained
PAT, or **`admin:repo_hook`** scope on a classic PAT. The seed surfaces a
clear error and skips webhook install when the token lacks this.

`GitHubService.ensureWebhook()` exposes the same logic as a reusable method
in case you want to wire it elsewhere (e.g. an admin "rotate webhook" button
in the dashboard).

#### Jira: still manual

The Jira webhook is created from **Site administration → System → Webhooks**:
- URL: `<base>/webhooks/jira`
- Secret: `JIRA_WEBHOOK_SECRET`
- Events: Issue updated

Jira Cloud's REST webhook API creates **dynamic webhooks** that expire after
30 days unless refreshed — not a great fit for the hackathon. Classic admin
webhooks must be created via the UI.

⚠️ **Tunnel URLs change between sessions** (free plans). When you restart
your tunnel:
1. Update `PUBLIC_BASE_URL` in `.env` to the new URL
2. Re-run `npm run seed:github` → it patches the existing GitHub hook to the new URL automatically (or use the wrapper: `npm run prisma:migrate` style)
3. Update the Jira webhook URL manually in the Jira admin UI

⚠️ **Tunnel URLs change between sessions** (free plans). When you restart
your tunnel, update both `PUBLIC_BASE_URL` in `.env` AND the URL in the
GitHub/Jira webhook config.

---

### General security stance

- **Never reuse secrets between integrations.** Each `*_WEBHOOK_SECRET` is a
  separate random hex; if one provider leaks we don't compromise the others.
- **Never paste secrets into chat / commits / logs.** Even with your AI
  assistant — chat history is durable.
- **Generate webhook secrets with**:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Rotate** anything that ever touched a chat or a public commit immediately.
- **Treat tokens as passwords.** Smallest scope, shortest expiry, single repo
  / single project where possible.

---

### 1. Supabase (Postgres + pgvector)

| Env var | What it is |
|---------|------------|
| `DATABASE_URL` | Full Postgres connection string from Supabase project settings |

**Where to get it:**
1. Create a free project at https://supabase.com
2. Project Settings → Database → "Connection string" → URI
3. Copy and paste the URL into `DATABASE_URL` (replace `[YOUR-PASSWORD]` with the real password you set)

**Used by:**
- `PrismaService` — every DB read/write goes through here
- `RagService` — raw `$queryRaw` for pgvector cosine similarity
- All 4 seeds

**Notes:**
- pgvector is enabled automatically by `npm run init` via
  `prisma db execute --file prisma/init.sql`. If that fails (some Supabase
  plans restrict it), run `CREATE EXTENSION IF NOT EXISTS vector;` manually
  in the SQL editor.
- The connection pooler URL (with port `6543`) usually works better than the
  direct connection (`5432`) for serverless-style backends.

---

### 2. Gemini (Google AI Studio)

| Env var | What it is |
|---------|------------|
| `GEMINI_API_KEY` | API key for Google Generative AI |

**Where to get it:**
1. Sign in at https://aistudio.google.com
2. https://aistudio.google.com/app/apikey → "Create API key"
3. Copy immediately. **Treat as a password.**

**Used by:**
- `GeminiStrategy` (`packages/llm-client`) — `complete`, `stream`. **No embeddings** (Gemini's embedding endpoint isn't wired up).
- Default LLM for **3 of the 4 agent roles** (configurable in `llm_configs` table):
  - `INTAKE_AGENT` → `gemini-2.5-flash` (chat with the reporter)
  - `TRIAGE_AGENT` → `gemini-2.5-pro` (structured triage with RAG context)
  - `EMAIL_COMPOSER` → `gemini-2.5-flash` (resolution email writer)

**Notes:**
- Google AI Studio gives **generous free tier** (good for hackathon).
- The model picked per agent role lives in the `llm_configs` table — you can
  hot-swap models from the admin UI without redeploying.
- If you want to swap an agent role to use OpenAI / Anthropic, just `PATCH /config/llm/<role>` from the dashboard admin tab.

---

### 3. OpenAI

| Env var | What it is |
|---------|------------|
| `OPENAI_API_KEY` | API key for the OpenAI Platform |

**Where to get it:**
1. https://platform.openai.com/api-keys → "Create new secret key"
2. Copy immediately.

**Used by:**
- `OpenAIStrategy` (`packages/llm-client`) — `embed` method via `text-embedding-3-small` (1536 dimensions, matches the `Unsupported("vector(1536)")` columns in Prisma)
- Default LLM for the **`EMBEDDINGS` agent role** in `llm_configs`. This is what powers:
  - `RagService.embed` for every codebase chunk during indexing
  - `RagService.embed` for every incident description on creation
  - `RagService.searchSimilarIncidents` (used by the similar-incident detection)

**Notes:**
- This is the **only paid call** during heavy indexing. For Reaction Commerce
  full-tree indexing it costs roughly **~$0.05 USD** (cheap embedding model).
- The model dimension (1536) is hard-coded in the Prisma schema. If you
  change to a different embedding model with different dimensions, you must
  update `Unsupported("vector(<n>)")` in `schema.prisma` and re-migrate.
- Optional: you can also configure OpenAI as a chat provider for any agent
  role from the admin UI — `OpenAIStrategy.complete` is implemented.

---

### 4. Anthropic (optional)

| Env var | What it is |
|---------|------------|
| `ANTHROPIC_API_KEY` | API key for Claude. **Optional** — leave empty to skip |

**Where to get it:** https://console.anthropic.com/settings/keys

**Used by:**
- `AnthropicStrategy` (`packages/llm-client`). The `LlmClientModule` factory
  only registers this strategy if the env var is non-empty (logs a warn
  otherwise).
- Not assigned to any agent role by default. You can wire it via `PATCH /config/llm/<role>` to use Claude on Triage if you want.

---

### 5. Jira

| Env var | What it is |
|---------|------------|
| `JIRA_BASE_URL` | Your Atlassian site URL, e.g. `https://yourorg.atlassian.net` |
| `JIRA_EMAIL` | The Atlassian account email that owns the API token |
| `JIRA_API_TOKEN` | API token (not your password). Acts as a service credential |
| `JIRA_PROJECT_KEY` | Short uppercase project code (e.g. `AGNTX`). Determines where tickets are created |
| `JIRA_WEBHOOK_SECRET` | Random hex you choose. Used to verify HMAC of inbound webhooks |

**Where to get the API token:**
1. https://id.atlassian.com/manage-profile/security/api-tokens
2. "Create API token" → label it `sre-agent-hackathon`
3. **Copy immediately** — Atlassian shows it once and never again.

**Where to find the project key:**
- It's the short prefix on every issue ID. If your issues look like `ASD-123`, the project key is `ASD`.
- Or: open the project → Project settings → Details → "Key".

**Used by:**
- `JiraService` (`apps/backend/src/integrations/jira/jira.service.ts`) — REST v3 client
  - `getProjectStatuses` → discovers statuses (used by `seed:jira`)
  - `getIssueTransitions` → maps internal status IDs to transition IDs
  - `createTicket` → called by `IncidentsService.createFromChat` after triage
  - `transitionIssue` → called by `GitHubWebhookService` when a branch event triggers a status change
- `JiraWebhookService` — receives Jira webhooks, syncs status back into our DB
- Auth is HTTP Basic with `email:api_token` base64-encoded (per Atlassian docs)

**`seed:jira` does:**
1. Connects to your Jira project
2. Fetches all statuses defined in the project workflow
3. Maps each internal `IncidentStatus` (BACKLOG, IN_PROGRESS, IN_REVIEW, READY_TO_TEST, DONE) to a discovered Jira status by name. **Synonyms accepted**:
   - `BACKLOG` → `Backlog | To Do | Open`
   - `IN_PROGRESS` → `In Progress`
   - `IN_REVIEW` → `In Review | Code Review | Review`
   - `READY_TO_TEST` → `Ready to Test | Testing | QA`
   - `DONE` → `Done | Closed | Resolved`
4. Persists the mapping in `jira_status_mappings`
5. Patches `branch_state_rules.jira_status_id` so every GitOps rule knows which Jira status ID to push the ticket to
6. **Never mutates the Jira workflow.** If a required mapping has no match, exits non-zero with an actionable error and tells the user which status to add in Jira.

**Webhook (configure later in Jira UI):**
- Site administration → System → Webhooks → Create webhook
- URL: `https://<your-public-host>/webhooks/jira` (use ngrok in dev)
- Secret: paste the same value as `JIRA_WEBHOOK_SECRET`
- Events: at minimum `Issue → updated`

---

### 6. GitHub

| Env var | What it is |
|---------|------------|
| `GITHUB_TOKEN` | Personal Access Token (PAT). Fine-grained recommended |
| `GITHUB_OWNER` | Username or org that owns the repo (e.g. `Texelbit`) |
| `GITHUB_REPO` | Repo name where the SRE Agent will create incident branches |
| `GITHUB_WEBHOOK_SECRET` | Random hex for HMAC verification of inbound webhooks |

**Where to get the token:**

#### Option A — Fine-grained PAT (recommended, smallest blast radius)
1. https://github.com/settings/personal-access-tokens/new
2. **Token name**: `sre-agent-hackathon`
3. **Expiration**: 30–90 days
4. **Repository access**: "Only select repositories" → pick **one** repo
5. **Permissions** → Repositories tab — add these:
   | Permission | Access | Why |
   |---|---|---|
   | **Contents** | **Read and write** | 🔴 **Critical** — branch creation via `git/refs` |
   | **Metadata** | Read-only | Required (auto). Used by `getRepoInfo` |
   | **Pull requests** | Read and write | Recommended — enables future PR automation |
   | **Webhooks** | Read and write | Only needed if the agent should create the webhook itself. Read-only is fine if you create the webhook manually |
   | **Workflows** | Read and write | Optional — for future GitHub Actions integration |
6. **Generate token** → copy immediately

#### Option B — Classic PAT (alternative)
- https://github.com/settings/tokens → "Generate new token (classic)"
- Scopes: `repo` (full) + `workflow` + `admin:repo_hook`
- Pros: simpler. Cons: token has access to ALL your repos.

**Used by:**
- `GitHubService` (`apps/backend/src/integrations/github/github.service.ts`) — REST v3 client
  - `getRepoInfo` → validates the repo exists and the token works (used by `seed:github`)
  - `branchExists` → safety check before creating a new branch
  - `createBranch` → called by `IncidentsService.createFromChat` after the Jira ticket is created. Branch name follows `system_config.branch_naming_pattern` (default `bugfix/{ticketKey}_{slugTitle}_{timestamp}`)
- `GitHubWebhookService` — parses incoming events (`push`, `pull_request`, `pull_request_review`), maps them to `GithubEventType` enum, finds matching `BranchStateRule`, transitions Jira via `JiraService.transitionIssue`, captures PR URL + merge commit on `PR_MERGED`
- Auth: header `Authorization: token <TOKEN>` (works for both classic and fine-grained PATs)

**`seed:github` does:**
1. `GET /user` → reads the `x-oauth-scopes` header to verify the token is alive (logs a warn if `repo` scope appears missing on classic PATs)
2. `GET /repos/{owner}/{repo}` → confirms the repo exists and the token has access
3. Reads `default_base_branch` from `system_config` (default: `main`) and `GET /repos/{owner}/{repo}/branches/{branch}` to confirm it exists
4. **No mutations.** Pure read-only validation. If anything fails it exits non-zero with a clear message.

**Webhook (configure later in GitHub UI):**
- Repo Settings → Webhooks → Add webhook
- Payload URL: `https://<your-public-host>/webhooks/github` (use ngrok in dev)
- Content type: `application/json`
- Secret: paste the same value as `GITHUB_WEBHOOK_SECRET`
- Events to enable: `Pushes`, `Pull requests`, `Pull request reviews`

---

### 7. Email (SMTP via nodemailer — Google Workspace by default)

| Env var | What it is |
|---------|------------|
| `SMTP_SERVICE` | Optional nodemailer shortcut (e.g. `gmail`). When set, auto-resolves host/port/secure |
| `SMTP_HOST` | SMTP hostname. Used only if `SMTP_SERVICE` is empty. Default `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port (587 for STARTTLS, 465 for SSL). Default `587` |
| `SMTP_SECURE` | `false` for port 587, `true` for port 465 |
| `SMTP_USER` | Full email address used for SMTP auth |
| `SMTP_PASS` | **App Password** (NOT your real Google password) |
| `EMAIL_FROM` | RFC 5322 from header: `Display Name <email@domain>` (or just an email) |
| `EMAIL_APP_NAME` | Display name surfaced to the LLM and the email footer (default `SRE Agent`) |
| `EMAIL_DEFAULT_COMPANY` | Company name in the email footer (optional) |
| `EMAIL_SUPPORT_EMAIL` | Support address rendered in the footer (optional) |
| `EMAIL_COMPANY_ADDRESS` | Postal address rendered in the footer (optional) |
| `TEAM_EMAIL` | Engineering team distro for fallback notifications |

**Where to get the App Password (Google Workspace / Gmail):**
1. **Enable 2FA** on the Google account: https://myaccount.google.com/security
   (App Passwords are only available with 2FA enabled)
2. https://myaccount.google.com/apppasswords
3. App: "Mail" · Device: "Other (SRE Agent)"
4. Google generates a **16-character password**. Copy it (paste WITHOUT spaces)
5. Paste into `SMTP_PASS` in your **`.env`** (NEVER `.env.example` — that file is committed to git)

**For other SMTP providers** (Mailgun, SendGrid SMTP, AWS SES, Postfix...):
- Leave `SMTP_SERVICE` empty
- Set `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` accordingly
- The observer is provider-agnostic — it only knows about the nodemailer transport

**Used by:**
- `EmailObserver` (`apps/backend/src/notifications/observers/email.observer.ts`)
  - Creates a nodemailer `Transporter` once on `OnModuleInit`. Prefers the `service` shortcut when `SMTP_SERVICE` is set, falls back to host/port/secure
  - Calls `transporter.verify()` at boot (logs warn on failure but does NOT crash the backend)
  - `send(payload)` invokes `transporter.sendMail` with `from: env.emailFrom` for every notification dispatched by `NotificationsService`
  - **Appends a branded footer** to every email via `appendFooter()` using `EMAIL_APP_NAME` / `EMAIL_DEFAULT_COMPANY` / `EMAIL_SUPPORT_EMAIL` / `EMAIL_COMPANY_ADDRESS`. Empty values are skipped so the footer always renders cleanly
- `EmailComposerAgent` (Gemini) writes the body for `STATUS_DONE` events. It receives `appName` and `companyName` so it can sign the body on-brand. The agent is explicitly instructed NOT to add its own footer — the observer appends one downstream to avoid duplication.
- Other events use a short structured template + the same branded footer.

**Notes:**
- The default profile is Gmail / Google Workspace because the user owns
  their domain reputation — email from `sre-agent@yourdomain.com` lands in
  the inbox, not spam, and there's no third-party relay.
- The 16-char App Password is stored in `.env` with the same secrecy as any
  other secret — **never commit it, never paste it into chat, rotate immediately if leaked**.
- Free Gmail accounts have a **500 emails/day** limit. Workspace accounts
  bump this to 2000/day. For higher volume use a transactional provider.
- If you migrate to another SMTP provider in the future, **only `EmailObserver`
  needs to know** — the rest of the notifications module is decoupled via the
  `NotificationObserver` strategy interface.

---

### 8. Slack

| Env var | What it is |
|---------|------------|
| `SLACK_WEBHOOK_URL` | Incoming webhook URL for ONE channel |

**Where to get it (recommended path: app manifest)**

The fastest way to spin up the Slack app is via the **manifest** flow — it
pre-configures the right scope (`incoming-webhook`) in one shot, no clicking
through 5 settings panels.

1. https://api.slack.com/apps → **"Create New App"** → **"From a manifest"**
2. Pick your workspace
3. Paste this manifest (JSON tab):

```json
{
  "display_information": {
    "name": "SRE Agent",
    "description": "Posts incident notifications and status updates to your team channel",
    "background_color": "#0f172a"
  },
  "features": {
    "bot_user": {
      "display_name": "SRE Agent",
      "always_online": false
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "incoming-webhook"
      ]
    }
  },
  "settings": {
    "org_deploy_enabled": false,
    "socket_mode_enabled": false,
    "is_hosted": false,
    "token_rotation_enabled": false
  }
}
```

4. Next → Create
5. In the app dashboard left sidebar → **Install App** → **Install to Workspace**
6. Pick the channel where the SRE Agent should post (recommended: dedicated `#sre-incidents`) → **Allow**
7. Go to **Incoming Webhooks** in the left sidebar → scroll down → copy the generated webhook URL
8. Paste into `SLACK_WEBHOOK_URL` in your **`.env`** (NEVER `.env.example`)

The URL looks like `https://hooks.slack.com/services/T.../B.../...`

**Why the manifest is better than clicking through:**
- Reproducible: paste the same JSON in any workspace and the app comes out identical
- Versionable: you can keep this manifest in the repo (no secrets in it) so the team can recreate the app if needed
- Auto-includes the `incoming-webhook` bot scope — this is what unlocks the Incoming Webhooks feature panel. Without it, that panel is empty.

**About the access/refresh tokens you might see in OAuth & Permissions:**
- Those are for the **full Slack Web API** (`chat.postMessage`, `users.lookupByEmail`, etc.) — useful if you want per-user DMs, message updates, Block Kit interactivity
- **We don't use them.** Our `SlackObserver` only POSTs to the simple webhook URL. No OAuth flow, no token rotation, no scopes beyond `incoming-webhook`
- If you ever want to upgrade to per-user DMs (each engineer gets their own Slack DM instead of a channel post), you'd need to refactor `SlackObserver` to use `chat.postMessage` with a bot token, plus add `chat:write` + `users:read.email` scopes and either store `slackUserId` per user or do a `users.lookupByEmail` call before each send. Bigger change — left as a future improvement.

**Used by:**
- `SlackObserver` (`apps/backend/src/notifications/observers/slack.observer.ts`) — POSTs JSON `{ text }` to the webhook URL on incident events. Renders a simple structured message with priority, status, service, Jira link, branch name and recipient.

**Notes:**
- One webhook = one channel. If you want different channels for different severities or teams, extend `SlackObserver` to read multiple webhooks from config (e.g. `SLACK_WEBHOOK_URL_CRITICAL`, `SLACK_WEBHOOK_URL_DEFAULT`).
- The `SlackObserver` is registered in `NotificationsService` constructor inside the `Map<NotificationChannel, NotificationObserver>` alongside `EmailObserver` — adding a third channel (Discord, Teams, ...) is just a new class implementing `NotificationObserver`.
- The notification model is **complementary**:
  - 📧 **Email = per-user** (each engineer/admin gets a personal email via SMTP based on `notification_preferences`)
  - 💬 **Slack = team visibility** (the channel lights up so the whole team sees the alert at once)
- That split is intentional and standard practice for SRE workflows: emails carry the per-user accountability, Slack carries the team-wide situational awareness.

---

### 9. `ECOMMERCE_REF_REPO_URL` (RAG codebase source)

| Env var | What it is |
|---------|------------|
| `ECOMMERCE_REF_REPO_URL` | Any git URL the local `git` CLI can clone. Default: Reaction Commerce |
| `ECOMMERCE_REF_PATH` | (Optional) absolute path to an already-cloned folder. Overrides the temp clone |

**Used by:** the `init.mjs` codebase indexing flow (clone → index → cleanup). The URL is **not** used by the running backend at runtime — only at init time.

**Notes:**
- For a wow-factor demo, point at YOUR own repo so the SRE Agent's triage cites real production code from your codebase.
- For private repos, the local `git` CLI must already have credentials configured (SSH key or credential helper). The init script just shells out to `git clone`.
- This can be a different repo than `GITHUB_OWNER/GITHUB_REPO`. Common patterns:
  - **Same repo** for both → realistic demo, agent knows the code AND creates branches in the same place
  - **Different repos** → indexing a large open-source codebase while creating branches in a clean test repo
- The temp folder lives in the OS tmpdir (`%TEMP%` on Windows, `/tmp` on Linux/Mac) and is **always deleted** via `try/finally` + `rmSync`, even if indexing crashes.

---

### Quick reference: which env var feeds which module

| Env var | Consumed by | Required for |
|---------|-------------|--------------|
| `DATABASE_URL` | `PrismaService` | EVERYTHING |
| `JWT_PRIVATE_KEY` / `_PUBLIC_KEY` | `TokenService`, `JwtStrategy`, `RealtimeGateway`, `SwaggerAuthMiddleware` | Auth + realtime + Swagger gate |
| `BOOTSTRAP_ADMIN_*` | `seed:bootstrap` | First-boot super-admin user |
| `GEMINI_API_KEY` | `GeminiStrategy` (registered in `LlmClientModule`) | Intake agent + triage agent + email composer (default) |
| `OPENAI_API_KEY` | `OpenAIStrategy` (registered in `LlmClientModule`) | Embeddings (RAG) — required for indexer + similar incident detection |
| `ANTHROPIC_API_KEY` | `AnthropicStrategy` (optional) | Only if an agent role is set to ANTHROPIC in `llm_configs` |
| `JIRA_*` | `JiraService`, `JiraWebhookService`, `seed:jira` | Ticket creation + status sync |
| `GITHUB_*` | `GitHubService`, `GitHubWebhookService`, `seed:github` | Branch creation + GitOps state machine |
| `SMTP_*` | `EmailObserver` (nodemailer) | Incident notifications + resolution emails |
| `SLACK_WEBHOOK_URL` | `SlackObserver` | Slack notifications |
| `ECOMMERCE_REF_REPO_URL` | `init.mjs` (only at init time) | Codebase indexing |

---

## Frontend design system (dark modern refresh)

Both frontends share the same dark theme built on **Tailwind + framer-motion
+ lucide-react + clsx** (no heavy UI kit, zero dependency on shadcn/radix).

**Shared tokens** (defined in each app's `tailwind.config.js`):
- `surface.DEFAULT/raised/hover/border` — semantic dark surfaces
- `brand.500/600/700/glow` — indigo accent + box-shadow color
- Custom animations: `fade-in`, `slide-up`, `shimmer` + custom keyframes
- `boxShadow.glow` = indigo glow for primary CTAs

**Global CSS** (`src/index.css` in both apps):
- Imports Inter + JetBrains Mono from CDN
- Dark themed scrollbar via `::-webkit-scrollbar`
- Utility class `.glass` — `backdrop-blur + gradient + border`
- Utility class `.bg-gradient-mesh` — subtle radial gradient for hero backgrounds

**Dashboard UI kit** (`dashboard-web/src/components/ui/`):

| File | What it exports |
|------|-----------------|
| `cn.ts` | `cn()` — tiny clsx wrapper. Import from here instead of clsx directly |
| `Button.tsx` | `Button` with 4 variants (primary/secondary/ghost/danger), 3 sizes, `loading` state spinner, `icon` prop, framer-motion press + hover |
| `Card.tsx` | `Card` (glass surface), `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`. Optional `hover` lift + `glow` props |
| `Badge.tsx` | `StatusBadge` (dot indicator + colors per IncidentStatus), `PriorityBadge` (CRITICAL has box-shadow glow), `Chip` (neutral/brand/success/warning/danger tones) |
| `Skeleton.tsx` | `Skeleton`, `SkeletonRow`, `SkeletonCard` — shimmer loading states using the `.skeleton` class |
| `EmptyState.tsx` | Icon + title + description + optional CTA slot |

**Magic motion patterns**:
- `Layout.tsx` uses `layoutId="nav-active"` so the active nav item's background flies between items when route changes
- `AdminPage.tsx` uses `layoutId="admin-tab-active"` for the same effect on tabs
- KPI cards in `DashboardPage.tsx` use staggered `delay` with spring physics
- Message bubbles in `ChatPage.tsx` use `AnimatePresence` + stagger for entry
- `TypingIndicator` component — 3 dots pulsing with delayed opacity animation

**Page redesigns**:
- Dashboard: `LoginPage`, `Layout`, `DashboardPage`, `IncidentsPage` (with search + filter chips), `IncidentDetailPage` (hero header + 2-col layout + similar incidents with rich cards), `AdminPage` (with 6 tabs + magic motion)
- Report-web: `LoginPage` (glass card + glow orbs), `ChatPage` (full rewrite — header, bubbles with avatars, typing indicator, composer with attachments AnimatePresence, success card with emerald glow)

**Conventions**:
- Use `cn(...)` for conditional class names, never string template literals
- Prefer `motion.div` over `div` when the surface benefits from mount/hover animation
- Import icons from `lucide-react` — tree-shakeable, do NOT use emojis as iconography
- Every list that can be empty MUST render `<EmptyState />`, never plain "No items" text
- Every async list that can be loading MUST render a skeleton, never plain "Loading..." text

---

*Last updated: 2026-04-08 — Block 11 + frontends + init.mjs + Swagger auth + clone-and-cleanup indexing + LLM providers/models CRUD + branch rules CRUD + similar incidents with Jira comment + auto-finalize intake + dark modern design refresh*
