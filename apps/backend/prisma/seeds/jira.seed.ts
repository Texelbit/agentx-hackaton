/**
 * Jira seed — discovers the configured project's statuses and builds the
 * `jira_status_mappings` table.
 *
 * Strict policy: NEVER mutates the Jira workflow.
 *
 * Language portability: matching is based on Jira's `statusCategory.key`,
 * which is one of three GLOBAL English identifiers — `new`, `indeterminate`,
 * `done` — that Jira uses internally regardless of the project's display
 * language. The localized `name` ("Tareas por hacer" / "À faire" / "To Do" /
 * "やること") is only used for logging. This means the seed works against any
 * Jira workspace, in any language, with zero manual intervention.
 *
 * Run with: `npm run seed:jira`
 */
// MUST be the first import — populates process.env from the repo-root .env
// before any code reads JIRA_* / DATABASE_URL / etc.
import './_load-env';
import { IncidentStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** The 3 universal Jira status category keys (always English, language-agnostic). */
type JiraCategoryKey = 'new' | 'indeterminate' | 'done' | 'undefined';

interface JiraStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: JiraCategoryKey;
    name: string; // localized — for logging only
  };
}

interface JiraIssueTypeStatuses {
  statuses: JiraStatus[];
}

/**
 * Required = the seed FAILS if no status with the given category exists.
 * Optional = the seed warns and skips the mapping. The internal pipeline
 *            still works; transitions through that state simply do not
 *            sync to Jira.
 */
interface InternalMapping {
  internal: IncidentStatus;
  category: JiraCategoryKey;
  /** Optional name hints used to disambiguate WHEN multiple statuses share a category. */
  nameHints?: string[];
  required: boolean;
}

const MAPPINGS: InternalMapping[] = [
  // BACKLOG → first "new" category status (always exists in any workflow)
  { internal: 'BACKLOG', category: 'new', required: true },

  // IN_PROGRESS → first "indeterminate" category status without a review/test hint
  { internal: 'IN_PROGRESS', category: 'indeterminate', required: true },

  // IN_REVIEW → second "indeterminate" status, preferring names containing
  // "review" or "revisión" or "revue" (works in EN/ES/FR by hint)
  {
    internal: 'IN_REVIEW',
    category: 'indeterminate',
    nameHints: ['review', 'revis', 'revue', 'prüf', 'コードレビュー'],
    required: false,
  },

  // READY_TO_TEST → an "indeterminate" status with a test/qa hint, OR a "done"
  // category status that is NOT the final one (some workflows put QA between
  // dev and final close)
  {
    internal: 'READY_TO_TEST',
    category: 'indeterminate',
    nameHints: ['test', 'prueb', 'qa', 'qualité', 'テスト'],
    required: false,
  },

  // DONE → first "done" category status (always exists)
  { internal: 'DONE', category: 'done', required: true },
];

async function main(): Promise<void> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const projectKey = process.env.JIRA_PROJECT_KEY;
  if (!baseUrl || !email || !token || !projectKey) {
    throw new Error(
      'Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN / JIRA_PROJECT_KEY',
    );
  }

  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

  console.log(`[jira-seed] connecting to ${baseUrl} project=${projectKey}`);

  const res = await fetch(
    `${baseUrl}/rest/api/3/project/${projectKey}/statuses`,
    { headers: { Accept: 'application/json', Authorization: auth } },
  );

  if (!res.ok) {
    throw new Error(
      `Jira API ${res.status}: ${await res.text()} — check JIRA_PROJECT_KEY and credentials`,
    );
  }

  const data = (await res.json()) as JiraIssueTypeStatuses[];
  const dedup = new Map<string, JiraStatus>();
  for (const it of data) {
    for (const s of it.statuses) dedup.set(s.id, s);
  }
  const discovered = Array.from(dedup.values());

  console.log(
    `[jira-seed] discovered ${discovered.length} statuses:`,
  );
  for (const s of discovered) {
    console.log(
      `  - "${s.name}" (id=${s.id}, category=${s.statusCategory.key})`,
    );
  }

  // Group by category for the resolution algorithm
  const byCategory: Record<JiraCategoryKey, JiraStatus[]> = {
    new: discovered.filter((s) => s.statusCategory.key === 'new'),
    indeterminate: discovered.filter(
      (s) => s.statusCategory.key === 'indeterminate',
    ),
    done: discovered.filter((s) => s.statusCategory.key === 'done'),
    undefined: discovered.filter((s) => s.statusCategory.key === 'undefined'),
  };

  const resolved: {
    internalStatus: IncidentStatus;
    jiraStatusId: string;
    jiraStatusName: string;
  }[] = [];

  const usedIds = new Set<string>();
  const missingRequired: IncidentStatus[] = [];
  const missingOptional: IncidentStatus[] = [];

  for (const m of MAPPINGS) {
    const candidates = byCategory[m.category];
    let pick: JiraStatus | undefined;

    if (m.nameHints && m.nameHints.length > 0) {
      // Prefer a status whose name contains a hint and hasn't been used yet
      pick = candidates.find(
        (s) =>
          !usedIds.has(s.id) &&
          m.nameHints!.some((h) => s.name.toLowerCase().includes(h)),
      );
    }

    if (!pick) {
      // Fall back to the first unused status in the category
      pick = candidates.find((s) => !usedIds.has(s.id));
    }

    if (!pick) {
      if (m.required) missingRequired.push(m.internal);
      else missingOptional.push(m.internal);
      continue;
    }

    usedIds.add(pick.id);
    resolved.push({
      internalStatus: m.internal,
      jiraStatusId: pick.id,
      jiraStatusName: pick.name,
    });
    console.log(
      `[jira-seed] ${m.internal.padEnd(15)} → "${pick.name}" (category=${pick.statusCategory.key})`,
    );
  }

  if (missingOptional.length > 0) {
    console.warn(
      `\n[jira-seed] WARNING — these optional statuses have no Jira counterpart and will be skipped:`,
    );
    for (const i of missingOptional) {
      console.warn(`  - ${i}`);
    }
    console.warn(
      `  (the internal incident pipeline still goes through these states; only the Jira side will not be transitioned)\n`,
    );
  }

  if (missingRequired.length > 0) {
    console.error(
      `\n[jira-seed] FAILED — the following REQUIRED statuses have no Jira counterpart in project ${projectKey}:`,
    );
    for (const i of missingRequired) {
      const cat = MAPPINGS.find((m) => m.internal === i)!.category;
      console.error(
        `  - ${i} → expected at least one Jira status with statusCategory.key="${cat}"`,
      );
    }
    console.error(
      `\nThis is unusual: every Jira workflow ships with at least one status in each of the 3 universal categories. Check that JIRA_PROJECT_KEY points to a valid project with a working workflow.\n`,
    );
    process.exit(2);
  }

  // Persist the mapping
  for (const r of resolved) {
    await prisma.jiraStatusMapping.upsert({
      where: { internalStatus: r.internalStatus },
      update: {
        jiraStatusId: r.jiraStatusId,
        jiraStatusName: r.jiraStatusName,
      },
      create: r,
    });
  }

  // Patch branch_state_rules with the resolved Jira status IDs
  const rules = await prisma.branchStateRule.findMany();
  for (const rule of rules) {
    const mapping = resolved.find((r) => r.internalStatus === rule.targetStatus);
    if (mapping) {
      await prisma.branchStateRule.update({
        where: { id: rule.id },
        data: { jiraStatusId: mapping.jiraStatusId },
      });
    }
  }

  console.log(`\n[jira-seed] persisted ${resolved.length} mappings`);
  console.log('[jira-seed] done');
}

main()
  .catch((err) => {
    console.error('[jira-seed] FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
