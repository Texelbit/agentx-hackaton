import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BranchRuleConditionDto,
  BranchRuleDto,
  CreateBranchRuleDto,
  GithubEventType,
  IncidentStatus,
  JiraStatusOptionDto,
} from '@sre/shared-types';
import { motion } from 'framer-motion';
import {
  GitBranch,
  GripVertical,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { BranchPicker } from './ui/BranchPicker';
import { Button } from './ui/Button';
import { cn } from './ui/cn';
import { Combobox, ComboboxOption } from './ui/Combobox';
import { EmptyState } from './ui/EmptyState';

/**
 * GitOps rule manager with drag-and-drop priority reordering and a manual
 * Jira-status picker for rules where the auto-resolution couldn't find a
 * mapping. The full dark theme matches the rest of the dashboard.
 */
export function BranchRulesManager() {
  const queryClient = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: ['branch-rules'],
    queryFn: () =>
      api.get<BranchRuleDto[]>('/config/branch-rules').then((r) => r.data),
  });

  const jiraStatusesQuery = useQuery({
    queryKey: ['branch-rules', 'jira-statuses'],
    queryFn: () =>
      api
        .get<JiraStatusOptionDto[]>('/config/branch-rules/jira-statuses')
        .then((r) => r.data),
  });

  const githubBranchesQuery = useQuery({
    queryKey: ['branch-rules', 'github-branches'],
    queryFn: () =>
      api
        .get<string[]>('/config/branch-rules/github-branches')
        .then((r) => r.data),
  });

  // Local optimistic copy of the rule list — drives the sortable UI without
  // waiting for the server round-trip.
  const [localRules, setLocalRules] = useState<BranchRuleDto[]>([]);
  useEffect(() => {
    if (rulesQuery.data) setLocalRules(rulesQuery.data);
  }, [rulesQuery.data]);

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

  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api
        .post<BranchRuleDto[]>('/config/branch-rules/reorder', { ids })
        .then((r) => r.data),
    onSuccess: refresh,
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      alert(err.response?.data?.message ?? err.message);
      refresh();
    },
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
      void queryClient.invalidateQueries({
        queryKey: ['branch-rules', 'jira-statuses'],
      });
      alert(
        `Resync complete: ${data.resolved} rules linked to Jira, ${data.missing} unmapped.`,
      );
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localRules.findIndex((r) => r.id === active.id);
    const newIndex = localRules.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(localRules, oldIndex, newIndex);
    setLocalRules(next);
    reorder.mutate(next.map((r) => r.id));
  }

  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-base font-semibold text-white">Branch state rules</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          When the SRE Agent receives a GitHub webhook event matching one of
          these rules, it transitions the linked incident (and its Jira
          ticket) to the target status. <strong className="text-zinc-400">Drag the
          handle</strong> to reorder — rules are evaluated top to bottom.
        </p>
      </header>

      <CreateRuleForm
        branches={githubBranchesQuery.data ?? []}
        onSubmit={(dto) => create.mutate(dto)}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          {localRules.length} rule(s) configured
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          loading={resync.isPending}
          onClick={() => resync.mutate()}
        >
          Resync Jira mapping
        </Button>
      </div>

      {rulesQuery.isLoading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : localRules.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No rules yet"
          description="Add one above to start automating incident transitions."
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={localRules.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {localRules.map((rule) => (
                <SortableRuleCard
                  key={rule.id}
                  rule={rule}
                  jiraStatuses={jiraStatusesQuery.data ?? []}
                  branches={githubBranchesQuery.data ?? []}
                  onUpdate={(patch) =>
                    updateRule.mutate({ id: rule.id, patch })
                  }
                  onDelete={() => {
                    if (confirm('Delete this rule?')) remove.mutate(rule.id);
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

// ── Sortable card row ──────────────────────────────────────────────────

function SortableRuleCard({
  rule,
  jiraStatuses,
  branches,
  onUpdate,
  onDelete,
}: {
  rule: BranchRuleDto;
  jiraStatuses: JiraStatusOptionDto[];
  branches: string[];
  onUpdate: (patch: Partial<BranchRuleDto>) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: rule.id,
    // Snappy reorder animation — the default 250ms cubic-bezier feels laggy
    // when you're dragging multiple items in quick succession.
    transition: {
      duration: 150,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  const style: React.CSSProperties = {
    // Disable transform transition WHILE dragging — `transform` is what
    // moves the card under the cursor and any transition delay makes it
    // feel like the card is "dragging behind" your pointer.
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const mergedLabel =
    rule.condition.merged === undefined
      ? null
      : `merged = ${rule.condition.merged}`;

  function updateBaseBranch(next: string): void {
    const condition = { ...rule.condition };
    if (next.trim() === '') delete condition.baseBranch;
    else condition.baseBranch = next;
    onUpdate({ condition });
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl border bg-zinc-950 p-3 transition',
        isDragging
          ? 'border-brand-500/60 shadow-[0_8px_30px_-12px_rgba(99,102,241,0.6)]'
          : 'border-zinc-800 hover:border-zinc-700',
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-8 w-6 cursor-grab touch-none items-center justify-center rounded text-zinc-600 transition hover:bg-zinc-900 hover:text-zinc-300 active:cursor-grabbing"
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Position number */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 font-mono text-[11px] font-semibold text-zinc-400 ring-1 ring-zinc-800">
        {rule.priority + 1}
      </div>

      {/* Event badge */}
      <span className="shrink-0 rounded-md bg-brand-500/10 px-2 py-1 font-mono text-[11px] font-medium text-brand-300 ring-1 ring-brand-500/20">
        {rule.eventType}
      </span>

      {/* Base branch picker */}
      <BranchPicker
        value={rule.condition.baseBranch ?? ''}
        branches={branches}
        onChange={updateBaseBranch}
        className="min-w-[220px]"
      />

      {/* Optional merged flag */}
      {mergedLabel && (
        <span className="shrink-0 rounded-md bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-500 ring-1 ring-zinc-800">
          {mergedLabel}
        </span>
      )}

      {/* Arrow + status select */}
      <span className="shrink-0 text-zinc-600">→</span>
      <select
        value={rule.targetStatus}
        onChange={(e) =>
          onUpdate({ targetStatus: e.target.value as IncidentStatus })
        }
        className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100 focus:border-brand-500 focus:outline-none"
      >
        {Object.values(IncidentStatus).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {/* Jira link */}
      <JiraStatusPicker
        rule={rule}
        jiraStatuses={jiraStatuses}
        onPick={(jiraStatusId) => onUpdate({ jiraStatusId })}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Active toggle */}
      <button
        onClick={() => onUpdate({ active: !rule.active })}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition',
          rule.active
            ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
            : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700',
        )}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            rule.active ? 'bg-emerald-500' : 'bg-zinc-600',
          )}
        />
        {rule.active ? 'active' : 'inactive'}
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="shrink-0 rounded-md p-1.5 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-400"
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// ── Jira status picker (linked vs unlinked) ───────────────────────────

function JiraStatusPicker({
  rule,
  jiraStatuses,
  onPick,
}: {
  rule: BranchRuleDto;
  jiraStatuses: JiraStatusOptionDto[];
  onPick: (jiraStatusId: string) => void;
}) {
  // Build combobox options from the Jira statuses list. Each option is
  // keyed by the Jira status id, shows the status name as the label and
  // its category (when known) as a small hint chip.
  const options = useMemo<ComboboxOption[]>(
    () =>
      jiraStatuses.map((s) => ({
        value: s.id,
        label: s.name,
        hint: s.category ?? undefined,
      })),
    [jiraStatuses],
  );

  if (jiraStatuses.length === 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-400">
        <XCircle className="h-3 w-3" />
        no Jira statuses (run seed)
      </span>
    );
  }

  const isLinked = Boolean(rule.jiraStatusId);

  return (
    <Combobox
      value={rule.jiraStatusId ?? ''}
      options={options}
      onChange={onPick}
      placeholder="⚠ Pick Jira status"
      tone={isLinked ? 'emerald' : 'amber'}
      emptyLabel="No Jira statuses match"
      className="min-w-[200px]"
      footer="Type to search · Enter to pick"
    />
  );
}

// ── Create form ────────────────────────────────────────────────────────

function CreateRuleForm({
  branches,
  onSubmit,
}: {
  branches: string[];
  onSubmit: (dto: CreateBranchRuleDto) => void;
}) {
  const [eventType, setEventType] = useState<GithubEventType>(
    GithubEventType.PR_OPENED,
  );
  const [targetStatus, setTargetStatus] = useState<IncidentStatus>(
    IncidentStatus.IN_REVIEW,
  );
  // Default to the first available branch (usually `main` thanks to the
  // backend's priority sort) or empty string for "any".
  const [baseBranch, setBaseBranch] = useState<string>(branches[0] ?? '');
  const [merged, setMerged] = useState<'true' | 'false' | ''>('');

  // When the branches list arrives async, seed the default if empty
  useEffect(() => {
    if (!baseBranch && branches.length > 0) {
      setBaseBranch(branches[0]);
    }
  }, [branches, baseBranch]);

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    const condition: BranchRuleConditionDto = {};
    if (baseBranch.trim()) condition.baseBranch = baseBranch.trim();
    if (merged !== '') condition.merged = merged === 'true';
    onSubmit({ eventType, targetStatus, condition, active: true });
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
    >
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Add a rule
      </h4>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="When event">
          <Select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as GithubEventType)}
          >
            {Object.values(GithubEventType).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Base branch">
          <BranchPicker
            value={baseBranch}
            branches={branches}
            onChange={setBaseBranch}
          />
        </Field>

        <Field label="Merged?">
          <Select
            value={merged}
            onChange={(e) =>
              setMerged(e.target.value as 'true' | 'false' | '')
            }
          >
            <option value="">— any —</option>
            <option value="true">merged = true</option>
            <option value="false">merged = false</option>
          </Select>
        </Field>

        <Field label="→ Status">
          <Select
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value as IncidentStatus)}
          >
            {Object.values(IncidentStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          Add rule
        </Button>
      </div>
    </motion.form>
  );
}

// ── Reusable form primitives ──────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
    />
  );
}
