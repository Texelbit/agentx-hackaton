# Scaling — SRE Incident Response Agent

How the system scales, our assumptions, and the technical decisions behind them.

---

## Current architecture

The system runs as a **single NestJS process** serving:
- REST API (incidents, auth, config, audit)
- SSE streaming (chat with IntakeAgent)
- WebSocket gateway (real-time dashboard updates)
- GitHub webhook receiver

**Database:** Supabase PostgreSQL with pgvector extension for RAG embeddings.
**Storage:** Google Cloud Storage for incident attachments.
**External services:** Jira Cloud, GitHub API, Gmail SMTP, Slack webhooks.

---

## Scaling dimensions

### 1. Concurrent users & incidents

| Component | Current capacity | Bottleneck | Scaling strategy |
|---|---|---|---|
| REST API | ~500 req/s per instance | CPU-bound JSON parsing | Horizontal: stateless, add instances behind load balancer |
| SSE chat streams | ~200 concurrent per instance | Memory (open connections) | Horizontal: sticky sessions or Redis-backed SSE |
| WebSocket gateway | ~1000 concurrent per instance | Memory | Redis adapter for Socket.io (`@socket.io/redis-adapter`) |
| Webhook processing | ~100/s per instance | LLM API latency, not CPU | Queue-based: BullMQ + Redis for async processing |

**Assumption:** For a hackathon demo, a single instance handles the load. In production, the stateless backend scales horizontally behind a load balancer (e.g., AWS ALB, GCP Cloud Run).

### 2. LLM API latency

The dominant cost in the pipeline is LLM inference:

| Agent | Model | Avg latency | Strategy |
|---|---|---|---|
| IntakeAgent (streaming) | Gemini 2.5 Pro | 2–5s per turn | Streamed via SSE — user sees tokens as they arrive |
| TriageAgent | Gemini 2.5 Pro | 3–8s | Async — user sees "Creating incident..." status |
| EmailComposerAgent | Gemini 2.5 Pro | 2–4s | Fire-and-forget after incident creation |
| Embeddings | OpenAI text-embedding-3-small | 200–500ms | Batched during indexer, single call per incident |

**Scaling strategy:**
- Runtime model swapping via Admin → LLM. If one provider is slow or down, switch to another without restart.
- For high throughput: queue triage jobs via BullMQ so the HTTP request returns immediately and triage runs in a worker.

### 3. RAG / pgvector

| Metric | Current | At scale |
|---|---|---|
| Incident embeddings | ~100 rows | Add IVFFlat index at 10k rows, HNSW at 100k |
| Codebase embeddings | ~2000 chunks | Stable — re-indexed on demand |
| Similarity query | <50ms (linear scan) | <10ms with HNSW index |

**Decision:** Linear scan is fine for hackathon scale. We documented the index migration path.

```sql
-- When incident count exceeds 10,000:
CREATE INDEX idx_incident_embedding ON rag_documents
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- When it exceeds 100,000:
CREATE INDEX idx_incident_embedding_hnsw ON rag_documents
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```

### 4. Attachments / Storage

| Current | At scale |
|---|---|
| GCS with signed URLs (30-day expiry) | CDN (Cloud CDN) in front of GCS bucket |
| Base64 in chat messages (DB) | Store reference only, serve from GCS |
| No size limit enforcement | Add mimetype + size validation (10MB max) |

### 5. Database connections

| Current | At scale |
|---|---|
| Supabase pooler (PgBouncer) | Same — connection pooling handles spikes |
| Single Prisma client | Read replicas for dashboard queries |

---

## Horizontal scaling plan

```
                    ┌─────────────┐
                    │  Load       │
                    │  Balancer   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
         │ Backend │ │ Backend │ │ Backend │
         │  (n=3)  │ │  (n=3)  │ │  (n=3)  │
         └────┬────┘ └────┬────┘ └────┬────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────┴──────┐
                    │   Redis     │ ← Socket.io adapter
                    │   + BullMQ  │ ← Job queue
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  PostgreSQL │ ← Supabase / RDS
                    │  + pgvector │
                    └─────────────┘
```

**Steps to go from hackathon to production:**

1. **Add Redis** — Socket.io pub/sub adapter + BullMQ job queue
2. **Queue heavy work** — triage, embedding, email composition run in BullMQ workers
3. **Add pgvector indexes** — IVFFlat/HNSW when row count justifies it
4. **CDN for attachments** — Cloud CDN in front of GCS
5. **Read replicas** — for dashboard KPI queries
6. **Rate limiting per user** — extend ThrottlerGuard with user-scoped limits

---

## Assumptions

1. **Single-org deployment** — no tenant isolation. Multi-tenancy would require schema-per-tenant or row-level security.
2. **LLM providers are external** — we don't self-host models. Cost scales linearly with incident volume.
3. **Supabase free tier is sufficient** for hackathon. Production would use a dedicated Postgres instance.
4. **Webhook delivery is reliable** — GitHub retries failed deliveries. We don't implement our own retry queue for webhook processing.
5. **Attachment size is reasonable** — screenshots are typically <5MB. We don't handle video uploads.

---

## Technical decisions

| Decision | Rationale |
|---|---|
| **NestJS monolith** over microservices | Faster to build, deploy, debug. Split later when bounded contexts emerge. |
| **Prisma** over raw SQL | Type-safe queries, migration management, pgvector support via `$queryRaw`. |
| **SSE** over WebSocket for chat | Simpler, HTTP-native, works through proxies. WebSocket reserved for dashboard realtime. |
| **Strategy pattern for LLMs** | Runtime swappable without code changes. Critical for hackathon resilience. |
| **Observer pattern for notifications** | Email + Slack + future channels without modifying incident service. |
| **pgvector** over dedicated vector DB | One less infrastructure dependency. Good enough for <100k vectors. |
| **Google Cloud Storage** over S3 | Team already had GCP credits and familiarity. S3 swap is trivial (same interface). |
