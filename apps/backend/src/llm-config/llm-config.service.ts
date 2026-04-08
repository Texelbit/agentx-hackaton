import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AgentRole as AgentCoreAgentRole,
  ILlmConfigResolver,
  ResolvedLlmConfig,
} from '@sre/agent-core';
import { LlmProvider as LlmClientProvider } from '@sre/llm-client';
import { AgentRole, LlmProviderKind } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

interface CacheEntry {
  config: ResolvedLlmConfig;
  expiresAt: number;
}

/**
 * Implements `ILlmConfigResolver` from `@sre/agent-core`.
 *
 * After the providers/models refactor, `resolve()` performs a 3-table join:
 *
 *   llm_configs.modelId  →  llm_models  →  llm_providers.kind
 *
 * The cache is keyed by `AgentRole` and stores the resolved
 * `{ provider: LlmProviderKind, model: string }` so the hot path stays a
 * single Map lookup.
 *
 * `update()` now takes a `modelId` (FK to `llm_models`) instead of a
 * provider/model string pair — the dashboard CRUD operates on the typed
 * relationship instead of free-form text.
 */
@Injectable()
export class LlmConfigService implements ILlmConfigResolver {
  private readonly logger = new Logger(LlmConfigService.name);
  private readonly cache = new Map<AgentRole, CacheEntry>();
  private static readonly TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async resolve(role: AgentCoreAgentRole): Promise<ResolvedLlmConfig> {
    // agent-core's AgentRole and Prisma's AgentRole have identical string
    // values; cast is a runtime no-op.
    const key = role as unknown as AgentRole;

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.config;
    }

    const row = await this.prisma.llmConfig.findUnique({
      where: { agentRole: key },
      include: { model: { include: { provider: true } } },
    });
    if (!row) {
      throw new NotFoundException(
        `llm_configs row missing for agent role ${role} — run seed:bootstrap`,
      );
    }
    if (!row.model.active || !row.model.provider.active) {
      throw new NotFoundException(
        `llm_configs[${role}] points to an inactive model or provider`,
      );
    }

    const config: ResolvedLlmConfig = {
      provider: row.model.provider.kind as unknown as LlmClientProvider,
      model: row.model.value,
    };

    this.cache.set(key, {
      config,
      expiresAt: Date.now() + LlmConfigService.TTL_MS,
    });

    return config;
  }

  /**
   * Returns every agent role with its currently assigned model + provider.
   * Used by the dashboard "LLM Assignments" sub-section.
   */
  async listAssignments(): Promise<
    {
      agentRole: AgentRole;
      modelId: string;
      modelName: string;
      modelValue: string;
      providerId: string;
      providerName: string;
      providerKind: LlmProviderKind;
    }[]
  > {
    const rows = await this.prisma.llmConfig.findMany({
      include: { model: { include: { provider: true } } },
    });
    return rows.map((r) => ({
      agentRole: r.agentRole,
      modelId: r.modelId,
      modelName: r.model.name,
      modelValue: r.model.value,
      providerId: r.model.providerId,
      providerName: r.model.provider.name,
      providerKind: r.model.provider.kind,
    }));
  }

  /**
   * Reassigns the model used by a given agent role. The model must exist and
   * be active. Cache is invalidated for that role so the next `resolve()`
   * picks up the new mapping immediately.
   */
  async assignModel(role: AgentRole, modelId: string): Promise<void> {
    const model = await this.prisma.llmModel.findUnique({
      where: { id: modelId },
      include: { provider: true },
    });
    if (!model) {
      throw new NotFoundException(`LlmModel ${modelId} not found`);
    }
    if (!model.active) {
      throw new NotFoundException(`LlmModel ${modelId} is inactive`);
    }
    if (!model.provider.active) {
      throw new NotFoundException(
        `LlmModel ${modelId} belongs to an inactive provider`,
      );
    }

    await this.prisma.llmConfig.upsert({
      where: { agentRole: role },
      update: { modelId },
      create: { agentRole: role, modelId },
    });
    this.cache.delete(role);
    this.logger.log(
      `llm_configs[${role}] → ${model.provider.name}/${model.name} (${model.value})`,
    );
  }

  invalidate(): void {
    this.cache.clear();
  }
}
