import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SystemConfigKey } from '../common/constants/system-config-keys.constants';
import { PrismaService } from '../prisma/prisma.service';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

/**
 * Strongly-typed accessor over the `system_config` table with an in-memory
 * cache (60s TTL) so hot paths don't hit the DB on every read.
 *
 * Other modules MUST go through the typed getters (`getDefaultBaseBranch`,
 * `getSimilarityThreshold`, etc.) instead of `getRaw(...)` so any key change
 * is caught at compile time.
 */
@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private static readonly TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  // ── Typed getters ────────────────────────────────────────────────────

  async getDefaultBaseBranch(): Promise<string> {
    return this.getRaw(SystemConfigKey.DEFAULT_BASE_BRANCH);
  }

  async getSimilarityThreshold(): Promise<number> {
    const raw = await this.getRaw(SystemConfigKey.SIMILARITY_THRESHOLD);
    return parseFloat(raw);
  }

  async getNotificationRateLimitSeconds(): Promise<number> {
    const raw = await this.getRaw(
      SystemConfigKey.NOTIFICATION_RATE_LIMIT_SECONDS,
    );
    return parseInt(raw, 10);
  }

  async getBranchNamingPattern(): Promise<string> {
    return this.getRaw(SystemConfigKey.BRANCH_NAMING_PATTERN);
  }

  // ── Generic CRUD (for the admin UI) ──────────────────────────────────

  async list(): Promise<
    { key: string; value: string; description: string }[]
  > {
    const all = await this.prisma.systemConfig.findMany({
      orderBy: { key: 'asc' },
    });
    return all.map((c) => ({
      key: c.key,
      value: c.value,
      description: c.description,
    }));
  }

  async setRaw(key: SystemConfigKey, value: string): Promise<void> {
    await this.prisma.systemConfig.update({
      where: { key },
      data: { value },
    });
    this.cache.delete(key);
    this.logger.log(`system_config[${key}] updated`);
  }

  async getRaw(key: SystemConfigKey): Promise<string> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const row = await this.prisma.systemConfig.findUnique({ where: { key } });
    if (!row) {
      throw new NotFoundException(`system_config[${key}] not seeded`);
    }

    this.cache.set(key, {
      value: row.value,
      expiresAt: Date.now() + SystemConfigService.TTL_MS,
    });
    return row.value;
  }

  invalidate(): void {
    this.cache.clear();
  }
}
