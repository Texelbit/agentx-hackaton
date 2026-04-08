/**
 * Canonical RAG collections. Backed by an enum so the rest of the codebase
 * never indexes against a string-typed collection name.
 *
 * Note: this is NOT a Prisma enum — it lives only in the application layer
 * because we want to add new collections without DB migrations.
 */
export enum RagCollection {
  INCIDENTS = 'INCIDENTS',
  CODEBASE = 'CODEBASE',
  LOGS = 'LOGS',
}
