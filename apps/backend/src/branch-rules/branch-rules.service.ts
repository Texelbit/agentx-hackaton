import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JiraService } from '../integrations/jira/jira.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BranchRuleDto,
  CreateBranchRuleDto,
  UpdateBranchRuleDto,
} from './dto/branch-rule.dto';

/**
 * CRUD over `branch_state_rules`. Each rule says:
 *
 *   "When this GitHub event happens (matching this condition),
 *    transition the linked incident — and its Jira ticket — to this status."
 *
 * Whenever a rule is created or updated and its `targetStatus` has a
 * mapping in `jira_status_mappings`, we eagerly resolve and store the
 * matching `jiraStatusId` so the webhook handler doesn't need to look it
 * up at runtime.
 */
@Injectable()
export class BranchRulesService {
  private readonly logger = new Logger(BranchRulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jira: JiraService,
  ) {}

  async findAll(): Promise<BranchRuleDto[]> {
    const rules = await this.prisma.branchStateRule.findMany({
      orderBy: [{ priority: 'asc' }, { eventType: 'asc' }],
    });
    return rules.map(BranchRuleDto.fromEntity);
  }

  async findById(id: string): Promise<BranchRuleDto> {
    const rule = await this.prisma.branchStateRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException(`BranchStateRule ${id} not found`);
    return BranchRuleDto.fromEntity(rule);
  }

  async create(dto: CreateBranchRuleDto): Promise<BranchRuleDto> {
    const jiraStatusId = await this.resolveJiraStatusId(dto.targetStatus);

    const created = await this.prisma.branchStateRule.create({
      data: {
        eventType: dto.eventType,
        condition: (dto.condition ?? {}) as Prisma.InputJsonValue,
        targetStatus: dto.targetStatus,
        priority: dto.priority ?? 0,
        active: dto.active ?? true,
        jiraStatusId,
      },
    });
    this.logger.log(
      `Created branch rule ${created.id} (${created.eventType} → ${created.targetStatus})`,
    );
    return BranchRuleDto.fromEntity(created);
  }

  async update(id: string, dto: UpdateBranchRuleDto): Promise<BranchRuleDto> {
    await this.findById(id);

    // If the target status is being changed, recompute the Jira status id
    let jiraStatusIdPatch: { jiraStatusId: string | null } | object = {};
    if (dto.targetStatus !== undefined) {
      jiraStatusIdPatch = {
        jiraStatusId: await this.resolveJiraStatusId(dto.targetStatus),
      };
    }

    const updated = await this.prisma.branchStateRule.update({
      where: { id },
      data: {
        ...(dto.eventType !== undefined ? { eventType: dto.eventType } : {}),
        ...(dto.condition !== undefined
          ? { condition: dto.condition as Prisma.InputJsonValue }
          : {}),
        ...(dto.targetStatus !== undefined
          ? { targetStatus: dto.targetStatus }
          : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...jiraStatusIdPatch,
      },
    });
    this.logger.log(`Updated branch rule ${updated.id}`);
    return BranchRuleDto.fromEntity(updated);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.branchStateRule.delete({ where: { id } });
    this.logger.log(`Deleted branch rule ${id}`);
  }

  /**
   * Re-runs the Jira status resolution for every rule. Used when the user
   * adds new statuses to their Jira project and wants to re-link the rules
   * without re-running the seed.
   */
  async resyncJiraStatuses(): Promise<{ resolved: number; missing: number }> {
    const rules = await this.prisma.branchStateRule.findMany();
    let resolved = 0;
    let missing = 0;
    for (const rule of rules) {
      const jiraStatusId = await this.resolveJiraStatusId(rule.targetStatus);
      await this.prisma.branchStateRule.update({
        where: { id: rule.id },
        data: { jiraStatusId },
      });
      if (jiraStatusId) resolved++;
      else missing++;
    }
    this.logger.log(
      `Resync complete — ${resolved} rules linked to Jira, ${missing} unmapped`,
    );
    return { resolved, missing };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /**
   * Looks up the Jira status id that corresponds to a given internal
   * `IncidentStatus` via the `jira_status_mappings` table populated by
   * `seed:jira`. Returns null when no mapping exists yet (the rule still
   * gets persisted, the webhook will simply skip the Jira transition until
   * the user runs `seed:jira` or the dashboard "Resync Jira" action).
   */
  private async resolveJiraStatusId(
    targetStatus: BranchRuleDto['targetStatus'],
  ): Promise<string | null> {
    const mapping = await this.prisma.jiraStatusMapping.findUnique({
      where: { internalStatus: targetStatus },
    });
    // The JiraService is injected so future improvements (e.g. validating
    // the status id is still alive in Jira) can use it without changing the
    // method signature.
    void this.jira;
    return mapping?.jiraStatusId ?? null;
  }
}
