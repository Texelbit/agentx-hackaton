# ⚡ Quick Guide — SRE Incident Response Agent

Get from zero to a fully-working multi-agent incident pipeline in ~10 minutes.

> 👀 **For context first** → read [README.md](README.md). For the deep dive → [AGENTS_USE.md](AGENTS_USE.md).

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | ≥ 20.0.0 | LTS recommended |
| **npm** | ≥ 10.0.0 | bundled with Node 20 |
| **PostgreSQL** | ≥ 15 with `pgvector` | **Supabase free tier works out of the box** |
| **Jira Cloud** | any | free tier + one empty project |
| **GitHub** | any | one repo + fine-grained PAT |
| **Gmail** | any | App Password (2FA required) |
| **Slack** | optional | incoming webhook URL |
| **VS Code** | optional | for Dev Tunnels → public webhook URL |

Accounts you'll need API keys for:
- **Gemini** → https://aistudio.google.com/app/apikey
- **OpenAI** → https://platform.openai.com/api-keys (embeddings only)
- **Anthropic** → https://console.anthropic.com (optional — Claude strategy)

---

## 2. Clone and configure

```bash
git clone <repo-url>
cd agentx-hackaton
cp .env.example .env
```

Open [`.env`](.env.example) and fill in:

### 🔑 Required blocks

```bash
# Database (Supabase pooler URL works great)
DATABASE_URL="postgresql://postgres.xxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.xxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

# LLM providers
GEMINI_API_KEY=...
OPENAI_API_KEY=...       # for embeddings

# Jira
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=...
JIRA_PROJECT_KEY=SRE

# GitHub
GITHUB_OWNER=your-org
GITHUB_REPO=your-repo
GITHUB_TOKEN=github_pat_...
GITHUB_WEBHOOK_SECRET=<random-32-byte-hex>

# Public base URL (for GitHub to reach your webhook)
# In dev, open a VS Code Dev Tunnel on :3000 and paste the URL here
PUBLIC_BASE_URL=https://your-tunnel-xyz.devtunnels.ms

# Email (Gmail SMTP via App Password)
SMTP_USER=you@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx    # 16-char App Password — no spaces
TEAM_EMAIL=team@example.com

# Slack (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Super admin (created by the bootstrap seed)
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=ChangeMe123!
```

> 📖 Every variable is documented inline in [`.env.example`](.env.example).

---

## 3. One-shot boot

```bash
npm run init
```

This runs [`scripts/init.mjs`](scripts/init.mjs) — a 13-step orchestrator that:

1. Verifies Node ≥ 20
2. Creates `.env` from example if missing
3. Generates JWT RS256 keypair
4. Runs `npm install` at the root (workspaces)
5. Runs `prisma generate`
6. Builds shared workspace packages
7. Ensures the `vector` extension exists
8. Runs Prisma migrations
9. **Seeds bootstrap** — super admin, roles, priorities, branch-state rules
10. **Seeds Jira** — discovers statuses/transitions by `statusCategory.key` (language-agnostic)
11. **Seeds GitHub** — auto-installs the webhook via `GitHubService.ensureWebhook()`
12. **Seeds the indexer** — clones the configured repo, chunks it, embeds it into pgvector
13. Prints a success banner with next steps

---

## 4. Run the apps

Three processes, three terminals:

```bash
npm run dev:backend      # NestJS API → http://localhost:3000
npm run dev:dashboard    # Admin + ops UI → http://localhost:5173
npm run dev:report       # Reporter chat → http://localhost:5174
```

---

## 5. Verification

| Check | URL | Expected |
|---|---|---|
| Backend health | http://localhost:3000/health | `{"status":"ok"}` |
| Swagger UI | http://localhost:3000/api/docs | Login page (use super admin creds) |
| Dashboard login | http://localhost:5173 | Dark glass login card |
| Report login | http://localhost:5174 | Same design, reporter account |
| GitHub webhook | GitHub → Settings → Webhooks | Green checkmark, recent delivery |
| Jira project | your Jira board | Empty, ready to receive tickets |

If any of the above fails, check backend logs — every integration error is logged with full context.

---

## 6. 🎬 Pre-built test scenario

This walks through the **mandatory 5-step hackathon flow** end-to-end.

### Step 1 — Report an incident (UI)
1. Open **http://localhost:5174**, log in as any reporter user (seeded by bootstrap).
2. Type: *"Hey, checkout is completely broken. When I click 'Pay' I get a 500 error and the cart empties."*
3. Optionally drop a screenshot.
4. Press **Enter**.

The `IntakeAgent` may ask one or two follow-up questions. Answer naturally. As soon as it has enough context, it auto-finalizes.

### Step 2 — Automatic triage
- Watch the backend logs: you'll see the `SREAgent` fire, pgvector similarity search, and a structured JSON response with title, description, priority, service.
- The UI shows an emerald success card with a link to the new incident.

### Step 3 — Jira ticket created
- Open your Jira project → a new ticket appears with the AI-generated title and description.
- The description contains a `🧠 Triage summary` section and a `🔗 Similar past incidents` block (if any matches ≥ threshold).

### Step 4 — Team notified
- Check **Gmail inbox** of `TEAM_EMAIL` → a branded HTML email with the incident summary + Jira link.
- Check your **Slack channel** → a rich message with the same info.

### Step 5 — Resolution notification
1. In your local clone of the demo repo, push a commit to the branch the agent created:
   ```bash
   git checkout incident/<branch-the-agent-made>
   git commit --allow-empty -m "fix: checkout"
   git push
   ```
2. Open a PR → merge it to `main`.
3. The GitHub webhook fires → the `branch-rules` state machine moves the incident to `DONE`, transitions the Jira ticket to its `done` category, and the `EmailComposerAgent` sends the **reporter** a personalized resolution email.

✅ All 5 steps demonstrated.

---

## 7. Admin tour (optional)

Open **http://localhost:5173/admin** as the super admin:

- **Users** — RBAC overview
- **Priorities** — editable catalog
- **GitOps rules** — drag-and-drop ordered state machine, search base branches, pick Jira statuses from a dropdown
- **System** — inline-editable key/value config
- **LLM** — swap agents to different providers/models at runtime
- **Audit log** — every admin action is journaled

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `DATABASE_URL not found` | Ensure `.env` is at the repo root, not inside `apps/backend/` |
| Jira ticket status not changing | Run `npm run seed:jira` to refresh status IDs |
| GitHub webhook not firing | Confirm `PUBLIC_BASE_URL` is reachable; re-run `npm run seed:github` |
| `pgvector` missing | Supabase: enable `vector` extension in SQL editor, or run [`init.sql`](apps/backend/prisma/init.sql) |
| Gmail `535 Auth` | Use an **App Password**, not your account password; 2FA must be on |
| LLM "model not found" | Admin → LLM → update the model `value` to the real provider ID |

More details: [HANDOFF.md → Integration Setup](HANDOFF.md).
