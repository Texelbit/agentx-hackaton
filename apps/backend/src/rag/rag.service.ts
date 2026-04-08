import { Inject, Injectable, Logger } from '@nestjs/common';
import { AgentRole } from '@sre/agent-core';
import { LlmClient, LlmProvider } from '@sre/llm-client';
import { Prisma } from '@prisma/client';
import { LlmConfigService } from '../llm-config/llm-config.service';
import { LLM_CLIENT } from '../llm-client/llm-client.module';
import { PrismaService } from '../prisma/prisma.service';
import { RagCollection } from './enums/rag-collection.enum';
import { RagSearchResult } from './interfaces/rag-search-result.interface';

interface RawSearchRow {
  id: string;
  collection: string;
  source: string | null;
  content: string;
  metadata: unknown;
  similarity: number;
}

interface RawIncidentSimilarityRow {
  id: string;
  similarity: number;
}

/**
 * Encapsulates every interaction with pgvector via Prisma `$queryRaw`.
 *
 * The Prisma client cannot type `vector(1536)` columns natively, so we keep
 * all raw SQL inside this service — no other module ever runs `$queryRaw`
 * against the embedding columns.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmConfig: LlmConfigService,
    @Inject(LLM_CLIENT) private readonly llmClient: LlmClient,
  ) {}

  // ── Embeddings ───────────────────────────────────────────────────────

  async embed(text: string): Promise<number[]> {
    const cfg = await this.llmConfig.resolve(AgentRole.EMBEDDINGS);
    const strategy = this.llmClient.forProvider(cfg.provider);
    return strategy.embed(text);
  }

  // ── RagDocument collection (codebase / logs / global) ────────────────

  async upsertDocument(
    collection: RagCollection,
    content: string,
    metadata: Record<string, unknown> = {},
    source?: string,
  ): Promise<void> {
    const embedding = await this.embed(content);
    const literal = this.toVectorLiteral(embedding);

    await this.prisma.$executeRaw`
      INSERT INTO rag_documents (id, collection, source, content, metadata, embedding, created_at)
      VALUES (
        gen_random_uuid(),
        ${collection},
        ${source ?? null},
        ${content},
        ${metadata as Prisma.InputJsonValue}::jsonb,
        ${literal}::vector,
        NOW()
      )
    `;
  }

  async search(
    collection: RagCollection,
    query: string,
    topK: number = 5,
  ): Promise<RagSearchResult[]> {
    const embedding = await this.embed(query);
    const literal = this.toVectorLiteral(embedding);

    const rows = await this.prisma.$queryRaw<RawSearchRow[]>`
      SELECT
        id,
        collection,
        source,
        content,
        metadata,
        1 - (embedding <=> ${literal}::vector) AS similarity
      FROM rag_documents
      WHERE collection = ${collection}
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${topK}
    `;

    return rows.map((r) => ({
      id: r.id,
      collection: r.collection,
      source: r.source,
      content: r.content,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      similarity: Number(r.similarity),
    }));
  }

  // ── Incident embeddings (separate column on `incidents`) ─────────────

  async embedIncident(incidentId: string, text: string): Promise<void> {
    const embedding = await this.embed(text);
    const literal = this.toVectorLiteral(embedding);

    await this.prisma.$executeRaw`
      UPDATE incidents
      SET embedding = ${literal}::vector
      WHERE id = ${incidentId}
    `;
  }

  /**
   * Cosine similarity search over the `incidents.embedding` column.
   * Used by the similar-incident detection in the intake pipeline.
   */
  async searchSimilarIncidents(
    text: string,
    threshold: number,
    topK: number = 5,
    excludeIncidentId?: string,
  ): Promise<{ incidentId: string; similarity: number }[]> {
    const embedding = await this.embed(text);
    const literal = this.toVectorLiteral(embedding);

    const rows = await this.prisma.$queryRaw<RawIncidentSimilarityRow[]>`
      SELECT
        id,
        1 - (embedding <=> ${literal}::vector) AS similarity
      FROM incidents
      WHERE embedding IS NOT NULL
        AND (${excludeIncidentId}::text IS NULL OR id <> ${excludeIncidentId}::text)
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${topK}
    `;

    return rows
      .map((r) => ({
        incidentId: r.id,
        similarity: Number(r.similarity),
      }))
      .filter((r) => r.similarity >= threshold);
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /**
   * Serializes a number array into the pgvector literal format.
   * pgvector expects exactly: `[1.234,5.678,9.012]`
   */
  private toVectorLiteral(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }
}
