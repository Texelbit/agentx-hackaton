/**
 * Bootstrap seed — idempotent. Safe to re-run on every boot.
 *
 * Inserts: roles, permissions, role_permissions, the SUPER_ADMIN user from
 * env, priorities, system_config, llm_configs, branch_state_rules,
 * indexing_status rows.
 *
 * Run with: `npm run seed:bootstrap`
 */
// MUST be the first import — populates process.env from the repo-root .env
// before any code reads DATABASE_URL / BOOTSTRAP_ADMIN_* / etc.
import './_load-env';
import {
  AgentRole,
  GithubEventType,
  IncidentStatus,
  IndexingState,
  LlmProviderKind,
  PrismaClient,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PERMISSIONS: { name: string; description: string }[] = [
  { name: 'incidents:create', description: 'Create new incidents' },
  { name: 'incidents:read:all', description: 'View all incidents' },
  { name: 'incidents:read:own', description: 'View own incidents only' },
  { name: 'incidents:update', description: 'Update incident details and status' },
  { name: 'incidents:link', description: 'Confirm or reject incident links' },
  { name: 'users:manage', description: 'Create, update and deactivate users' },
  { name: 'users:manage:admins', description: 'Manage other admins (SUPER_ADMIN only)' },
  { name: 'config:manage', description: 'Manage GitOps and system configuration' },
  { name: 'roles:manage', description: 'Manage roles and permissions' },
  { name: 'llm:manage', description: 'Manage LLM provider/model assignments' },
  { name: 'priorities:manage', description: 'Manage priority catalog' },
  { name: 'audit:read', description: 'Read audit log entries' },
];

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: PERMISSIONS.map((p) => p.name),
  ADMIN: PERMISSIONS.filter((p) => p.name !== 'users:manage:admins').map(
    (p) => p.name,
  ),
  ENGINEER: [
    'incidents:create',
    'incidents:read:all',
    'incidents:read:own',
    'incidents:update',
    'incidents:link',
  ],
  REPORTER: ['incidents:create', 'incidents:read:own'],
};

const PRIORITIES = [
  {
    name: 'CRITICAL',
    description:
      'Production is down or data loss is imminent. Immediate response required.',
    level: 1,
    color: '#dc2626',
  },
  {
    name: 'HIGH',
    description:
      'Major functionality is broken for many users. Same-day response required.',
    level: 2,
    color: '#ea580c',
  },
  {
    name: 'MEDIUM',
    description:
      'Significant issue with a workaround available. Address within the sprint.',
    level: 3,
    color: '#facc15',
  },
  {
    name: 'LOW',
    description: 'Minor issue with limited impact. Schedule for backlog grooming.',
    level: 4,
    color: '#3b82f6',
  },
  {
    name: 'INFO',
    description: 'Informational report or improvement suggestion.',
    level: 5,
    color: '#6b7280',
  },
];

const SYSTEM_CONFIG = [
  {
    key: 'default_base_branch',
    value: 'main',
    description: 'Default base branch used when creating incident branches.',
  },
  {
    key: 'similarity_threshold',
    value: '0.85',
    description: 'Cosine similarity threshold for similar incident detection.',
  },
  {
    key: 'notification_rate_limit_seconds',
    value: '30',
    description: 'Minimum seconds between notifications for the same incident/event/recipient.',
  },
  {
    key: 'branch_naming_pattern',
    value: 'bugfix/{ticketKey}_{slugTitle}_{timestamp}',
    description: 'Template for incident branch names.',
  },
];

/**
 * Default LLM providers seeded into `llm_providers`. Each one represents a
 * configurable provider record (NOT the strategy enum). Admins can rename,
 * disable, or add more from the dashboard at runtime.
 */
const LLM_PROVIDERS: { name: string; kind: LlmProviderKind }[] = [
  { name: 'Google Gemini', kind: 'GEMINI' },
  { name: 'OpenAI', kind: 'OPENAI' },
  { name: 'Anthropic Claude', kind: 'ANTHROPIC' },
];

/**
 * Default LLM models seeded into `llm_models`, indexed by the provider's
 * canonical name (matched against the seeded provider above).
 */
const LLM_MODELS: { providerName: string; name: string; value: string }[] = [
  { providerName: 'Google Gemini', name: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  { providerName: 'Google Gemini', name: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
  { providerName: 'OpenAI', name: 'Embedding 3 Small', value: 'text-embedding-3-small' },
  { providerName: 'OpenAI', name: 'GPT-4o mini', value: 'gpt-4o-mini' },
  { providerName: 'Anthropic Claude', name: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
];

/**
 * Default agent role → model assignments. Each entry references a model by
 * its `value` (which is unique per provider).
 */
const LLM_ASSIGNMENTS: { agentRole: AgentRole; modelValue: string }[] = [
  { agentRole: 'INTAKE_AGENT', modelValue: 'gemini-2.5-flash' },
  { agentRole: 'TRIAGE_AGENT', modelValue: 'gemini-2.5-pro' },
  { agentRole: 'EMAIL_COMPOSER', modelValue: 'gemini-2.5-flash' },
  { agentRole: 'EMBEDDINGS', modelValue: 'text-embedding-3-small' },
];

const BRANCH_STATE_RULES: {
  eventType: GithubEventType;
  condition: object;
  targetStatus: IncidentStatus;
  priority: number;
}[] = [
  { eventType: 'PUSH', condition: {}, targetStatus: 'IN_PROGRESS', priority: 1 },
  {
    eventType: 'PR_OPENED',
    condition: { baseBranch: 'main' },
    targetStatus: 'IN_REVIEW',
    priority: 2,
  },
  {
    eventType: 'PR_CLOSED',
    condition: { merged: false },
    targetStatus: 'IN_PROGRESS',
    priority: 3,
  },
  {
    eventType: 'PR_REVIEW_APPROVED',
    condition: {},
    targetStatus: 'READY_TO_TEST',
    priority: 4,
  },
  {
    eventType: 'PR_MERGED',
    condition: { baseBranch: 'main' },
    targetStatus: 'DONE',
    priority: 5,
  },
];

async function main(): Promise<void> {
  console.log('[bootstrap] starting…');

  // 1. Permissions
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: p.name },
      update: { description: p.description },
      create: p,
    });
  }
  console.log(`[bootstrap] permissions: ${PERMISSIONS.length}`);

  // 2. Roles
  const roleEntities: Record<Role, { id: string }> = {} as never;
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'ENGINEER', 'REPORTER'] as Role[]) {
    const entity = await prisma.roleEntity.upsert({
      where: { name: role },
      update: {},
      create: {
        name: role,
        description: `${role} role`,
      },
    });
    roleEntities[role] = { id: entity.id };
  }
  console.log('[bootstrap] roles: 4');

  // 3. Role-permission mapping
  for (const role of Object.keys(ROLE_PERMISSIONS) as Role[]) {
    const perms = await prisma.permission.findMany({
      where: { name: { in: ROLE_PERMISSIONS[role] } },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: roleEntities[role].id },
    });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({
        roleId: roleEntities[role].id,
        permissionId: p.id,
      })),
      skipDuplicates: true,
    });
  }
  console.log('[bootstrap] role_permissions wired');

  // 4. Bootstrap super-admin
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const adminFullName = process.env.BOOTSTRAP_ADMIN_FULL_NAME;
  if (!adminEmail || !adminPassword || !adminFullName) {
    throw new Error(
      'Missing BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD / BOOTSTRAP_ADMIN_FULL_NAME',
    );
  }

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: adminFullName,
        roleId: roleEntities.SUPER_ADMIN.id,
        isActive: true,
        isProtected: true,
      },
    });
    console.log(`[bootstrap] super-admin created: ${adminEmail}`);
  } else {
    console.log(`[bootstrap] super-admin already exists: ${adminEmail}`);
  }

  // 5. Priorities
  for (const p of PRIORITIES) {
    await prisma.priority.upsert({
      where: { name: p.name },
      update: { description: p.description, color: p.color },
      create: p,
    });
  }
  console.log(`[bootstrap] priorities: ${PRIORITIES.length}`);

  // 6. System config
  for (const c of SYSTEM_CONFIG) {
    await prisma.systemConfig.upsert({
      where: { key: c.key },
      update: { description: c.description },
      create: c,
    });
  }
  console.log(`[bootstrap] system_config: ${SYSTEM_CONFIG.length}`);

  // 7a. LLM providers
  const providerByName = new Map<string, { id: string }>();
  for (const p of LLM_PROVIDERS) {
    const provider = await prisma.llmProvider.upsert({
      where: { name: p.name },
      update: { kind: p.kind },
      create: { name: p.name, kind: p.kind },
    });
    providerByName.set(p.name, { id: provider.id });
  }
  console.log(`[bootstrap] llm_providers: ${LLM_PROVIDERS.length}`);

  // 7b. LLM models
  const modelByValue = new Map<string, { id: string }>();
  for (const m of LLM_MODELS) {
    const provider = providerByName.get(m.providerName);
    if (!provider) {
      throw new Error(
        `Bootstrap data inconsistency: model ${m.value} references unknown provider ${m.providerName}`,
      );
    }
    const model = await prisma.llmModel.upsert({
      where: {
        providerId_value: { providerId: provider.id, value: m.value },
      },
      update: { name: m.name },
      create: { providerId: provider.id, name: m.name, value: m.value },
    });
    modelByValue.set(m.value, { id: model.id });
  }
  console.log(`[bootstrap] llm_models: ${LLM_MODELS.length}`);

  // 7c. Agent role → model assignments
  for (const a of LLM_ASSIGNMENTS) {
    const model = modelByValue.get(a.modelValue);
    if (!model) {
      throw new Error(
        `Bootstrap data inconsistency: assignment ${a.agentRole} references unknown model ${a.modelValue}`,
      );
    }
    await prisma.llmConfig.upsert({
      where: { agentRole: a.agentRole },
      update: { modelId: model.id },
      create: { agentRole: a.agentRole, modelId: model.id },
    });
  }
  console.log(`[bootstrap] llm_configs: ${LLM_ASSIGNMENTS.length}`);

  // 8. Branch state rules — wipe & reseed, BUT preserve any jiraStatusId
  // values that `seed:jira` already populated. Without this, re-running
  // bootstrap would erase the Jira mapping and break the GitOps webhook
  // until the user re-runs `seed:jira`.
  const existingRules = await prisma.branchStateRule.findMany();
  const preservedJiraStatusId = new Map<string, string>();
  for (const rule of existingRules) {
    if (rule.jiraStatusId) {
      // Compose a stable key from (eventType, targetStatus) — every rule in
      // the seed list is unique on this pair, so we can map them 1:1.
      preservedJiraStatusId.set(
        `${rule.eventType}::${rule.targetStatus}`,
        rule.jiraStatusId,
      );
    }
  }

  await prisma.branchStateRule.deleteMany({});
  await prisma.branchStateRule.createMany({
    data: BRANCH_STATE_RULES.map((r) => ({
      eventType: r.eventType,
      condition: r.condition,
      targetStatus: r.targetStatus,
      priority: r.priority,
      jiraStatusId:
        preservedJiraStatusId.get(`${r.eventType}::${r.targetStatus}`) ?? null,
    })),
  });

  const preservedCount = Array.from(preservedJiraStatusId.values()).length;
  console.log(
    `[bootstrap] branch_state_rules: ${BRANCH_STATE_RULES.length}` +
      (preservedCount > 0
        ? ` (preserved ${preservedCount} jiraStatusId values from previous seed:jira)`
        : ''),
  );

  // 9. Indexing status rows
  for (const collection of ['INCIDENTS', 'CODEBASE', 'LOGS']) {
    await prisma.indexingStatus.upsert({
      where: { collection },
      update: {},
      create: { collection, status: IndexingState.PENDING },
    });
  }
  console.log('[bootstrap] indexing_status: 3');

  console.log('[bootstrap] done');
}

main()
  .catch((err) => {
    console.error('[bootstrap] FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
