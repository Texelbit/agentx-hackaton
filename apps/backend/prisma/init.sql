-- Enables the pgvector extension required by the embedding columns on the
-- `incidents` and `rag_documents` tables. Idempotent — safe to re-run.
--
-- Executed by the root `npm run init` script via `prisma db execute`.

CREATE EXTENSION IF NOT EXISTS vector;
