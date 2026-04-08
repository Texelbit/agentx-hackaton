import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BranchRuleConditionDto,
  BranchRuleDto,
  CreateBranchRuleDto,
  GithubEventType,
  IncidentStatus,
} from '@sre/shared-types';
import { FormEvent, useState } from 'react';
import { api } from '../lib/api';

/**
 * GitOps rule manager. Each rule expresses:
 *
 *   "When [eventType] happens on a branch matching [condition],
 *    transition the linked incident to [targetStatus]."
 *
 * The dashboard exposes the full rule set as a CRUD table so admins can
 * tune the GitOps state machine without touching the database.
 */
export function BranchRulesManager() {
  const queryClient = useQueryClient();
  const rulesQuery = useQuery({
    queryKey: ['branch-rules'],
    queryFn: () =>
      api.get<BranchRuleDto[]>('/config/branch-rules').then((r) => r.data),
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['branch-rules'] });
  };

  const create = useMutation({
    mutationFn: (dto: CreateBranchRuleDto) =>
      api.post<BranchRuleDto>('/config/branch-rules', dto).then((r) => r.data),
    onSuccess: refresh,
    onError: (err: Error & { response?: { data?: { message?: string } } }) =>
      alert(err.response?.data?.message ?? err.message),
  });

  const updateRule = useMutation({
    mutationFn: (args: { id: string; patch: Partial<BranchRuleDto> }) =>
      api
        .patch<BranchRuleDto>(`/config/branch-rules/${args.id}`, args.patch)
        .then((r) => r.data),
    onSuccess: refresh,
    onError: (err: Error & { response?: { data?: { message?: string } } }) =>
      alert(err.response?.data?.message ?? err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/config/branch-rules/${id}`),
    onSuccess: refresh,
  });

  const resync = useMutation({
    mutationFn: () =>
      api
        .post<{ resolved: number; missing: number }>(
          '/config/branch-rules/resync-jira',
        )
        .then((r) => r.data),
    onSuccess: (data) => {
      refresh();
      alert(
        `Resync complete: ${data.resolved} rules linked to Jira, ${data.missing} unmapped.`,
      );
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-base font-semibold text-slate-900">
          Branch state rules
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          When the SRE Agent receives a GitHub webhook event matching one of
          these rules, it transitions the linked incident (and its Jira ticket)
          to the target status. Rules are evaluated in priority order — lower
          numbers first.
        </p>
      </header>

      <CreateRuleForm onSubmit={(dto) => create.mutate(dto)} />

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {rulesQuery.data?.length ?? 0} rule(s) configured
        </span>
        <button
          onClick={() => resync.mutate()}
          disabled={resync.isPending}
          className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {resync.isPending ? 'Resyncing…' : 'Resync Jira mapping'}
        </button>
      </div>

      {rulesQuery.isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (rulesQuery.data?.length ?? 0) === 0 ? (
        <div className="rounded border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          No rules yet. Add one above.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Priority</th>
              <th>Event</th>
              <th>Condition</th>
              <th>→ Status</th>
              <th>Jira link</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rulesQuery.data!.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onUpdate={(patch) => updateRule.mutate({ id: rule.id, patch })}
                onDelete={() => {
                  if (confirm('Delete this rule?')) remove.mutate(rule.id);
                }}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Create form ────────────────────────────────────────────────────────

function CreateRuleForm({
  onSubmit,
}: {
  onSubmit: (dto: CreateBranchRuleDto) => void;
}) {
  const [eventType, setEventType] = useState<GithubEventType>(
    GithubEventType.PR_OPENED,
  );
  const [targetStatus, setTargetStatus] = useState<IncidentStatus>(
    IncidentStatus.IN_REVIEW,
  );
  const [baseBranch, setBaseBranch] = useState('main');
  const [merged, setMerged] = useState<'true' | 'false' | ''>('');
  const [priority, setPriority] = useState(10);

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();

    const condition: BranchRuleConditionDto = {};
    if (baseBranch.trim()) condition.baseBranch = baseBranch.trim();
    if (merged !== '') condition.merged = merged === 'true';

    onSubmit({
      eventType,
      targetStatus,
      condition,
      priority,
      active: true,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <h4 className="mb-3 text-sm font-semibold text-slate-900">Add a rule</h4>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className="flex flex-col text-xs">
          <span className="mb-1 font-medium text-slate-600">When event</span>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as GithubEventType)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {Object.values(GithubEventType).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs">
          <span className="mb-1 font-medium text-slate-600">Base branch</span>
          <input
            type="text"
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            placeholder="main"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>

        <label className="flex flex-col text-xs">
          <span className="mb-1 font-medium text-slate-600">Merged?</span>
          <select
            value={merged}
            onChange={(e) => setMerged(e.target.value as 'true' | 'false' | '')}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">— any —</option>
            <option value="true">merged = true</option>
            <option value="false">merged = false</option>
          </select>
        </label>

        <label className="flex flex-col text-xs">
          <span className="mb-1 font-medium text-slate-600">→ Status</span>
          <select
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value as IncidentStatus)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {Object.values(IncidentStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs">
          <span className="mb-1 font-medium text-slate-600">Priority</span>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            min={0}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
      </div>
      <div className="mt-3">
        <button
          type="submit"
          className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Add rule
        </button>
      </div>
    </form>
  );
}

// ── Row (inline edit) ──────────────────────────────────────────────────

function RuleRow({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: BranchRuleDto;
  onUpdate: (patch: Partial<BranchRuleDto>) => void;
  onDelete: () => void;
}) {
  const conditionLabel = (() => {
    const parts: string[] = [];
    if (rule.condition.baseBranch) parts.push(`base=${rule.condition.baseBranch}`);
    if (rule.condition.merged !== undefined)
      parts.push(`merged=${rule.condition.merged}`);
    return parts.length > 0 ? parts.join(' · ') : '— any —';
  })();

  return (
    <tr>
      <td className="py-2">
        <input
          type="number"
          defaultValue={rule.priority}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v !== rule.priority) onUpdate({ priority: v });
          }}
          className="w-16 rounded border border-slate-200 px-2 py-0.5 text-xs"
        />
      </td>
      <td className="font-mono text-xs">{rule.eventType}</td>
      <td className="text-xs text-slate-600">{conditionLabel}</td>
      <td>
        <select
          value={rule.targetStatus}
          onChange={(e) =>
            onUpdate({ targetStatus: e.target.value as IncidentStatus })
          }
          className="rounded border border-slate-300 px-2 py-0.5 text-xs"
        >
          {Object.values(IncidentStatus).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td>
        {rule.jiraStatusId ? (
          <span
            className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
            title={rule.jiraStatusId}
          >
            ✓ linked
          </span>
        ) : (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
            ! unlinked
          </span>
        )}
      </td>
      <td>
        <button
          onClick={() => onUpdate({ active: !rule.active })}
          className="rounded px-2 py-0.5 text-xs"
          style={{
            backgroundColor: rule.active ? '#d1fae5' : '#fee2e2',
            color: rule.active ? '#065f46' : '#991b1b',
          }}
        >
          {rule.active ? '✓ active' : '✗ inactive'}
        </button>
      </td>
      <td className="text-right">
        <button
          onClick={onDelete}
          className="text-xs text-red-600 hover:underline"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
