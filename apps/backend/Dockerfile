# ── Build stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /workspace

# Copy root + workspace manifests so npm sees the workspace graph
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/llm-client/package.json packages/llm-client/
COPY packages/agent-core/package.json packages/agent-core/
COPY packages/tool-use/package.json packages/tool-use/
COPY apps/backend/package.json apps/backend/

RUN npm install --workspaces --include-workspace-root

# Copy sources and build
COPY packages packages
COPY apps/backend apps/backend

RUN npm run build --workspace=@sre/llm-client \
 && npm run build --workspace=@sre/agent-core \
 && npm run build --workspace=@sre/tool-use \
 && cd apps/backend && npx prisma generate && npm run build

# ── Runtime stage ───────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN apk add --no-cache openssl

WORKDIR /workspace

ENV NODE_ENV=production

COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/package.json ./package.json
COPY --from=builder /workspace/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /workspace/packages ./packages
COPY --from=builder /workspace/apps/backend ./apps/backend

WORKDIR /workspace/apps/backend

EXPOSE 3000

# Boot order: migrations → seeds → app
CMD sh -c "npx prisma migrate deploy \
  && npm run seed:bootstrap \
  && npm run seed:jira \
  && npm run seed:github \
  && npm run seed:indexer \
  && node dist/src/main.js"
