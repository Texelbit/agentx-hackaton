import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IncidentDto, PriorityDto, UserDto } from '@sre/shared-types';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  Calendar,
  ChevronDown,
  Cog,
  ExternalLink,
  GitBranch,
  ListChecks,
  ScrollText,
  Sparkles,
  Ticket,
  type LucideIcon,
  User,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PriorityBadge, StatusBadge } from '../components/ui/Badge';
import { BranchRulesManager } from '../components/BranchRulesManager';
import { LlmConfigManager } from '../components/LlmConfigManager';
import { SystemConfigManager } from '../components/SystemConfigManager';
import { Card } from '../components/ui/Card';
import { cn } from '../components/ui/cn';
import { api } from '../lib/api';

type Tab =
  | 'users'
  | 'priorities'
  | 'system'
  | 'llm'
  | 'branch-rules'
  | 'audit';

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'priorities', label: 'Priorities', icon: ListChecks },
  { id: 'branch-rules', label: 'GitOps rules', icon: GitBranch },
  { id: 'system', label: 'System', icon: Cog },
  { id: 'llm', label: 'LLM', icon: Bot },
  { id: 'audit', label: 'Audit log', icon: ScrollText },
];

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-brand-400">
          <Cog className="h-3.5 w-3.5" />
          <span>Administration</span>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          System settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage users, rules, integrations and system configuration.
        </p>
      </motion.div>

      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-1 backdrop-blur-sm">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'relative flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition',
                active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {active && (
                <motion.div
                  layoutId="admin-tab-active"
                  className="absolute inset-0 rounded-lg bg-zinc-800"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <t.icon className="relative h-3.5 w-3.5" />
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Card>
          <div className="p-6 text-zinc-300 [&_h3]:text-zinc-100 [&_h4]:text-zinc-100 [&_input]:border-zinc-800 [&_input]:bg-zinc-900/60 [&_input]:text-zinc-100 [&_select]:border-zinc-800 [&_select]:bg-zinc-900/60 [&_select]:text-zinc-100">
            {tab === 'users' && <UsersTab />}
            {tab === 'priorities' && <PrioritiesTab />}
            {tab === 'branch-rules' && <BranchRulesManager />}
            {tab === 'system' && <SystemConfigManager />}
            {tab === 'llm' && <LlmConfigManager />}
            {tab === 'audit' && <AuditTab />}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'ENGINEER', 'REPORTER'] as const;

function UsersTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserDto[]>('/users').then((r) => r.data),
  });

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('REPORTER');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (dto: { email: string; fullName: string; password: string; role: string }) =>
      api.post('/users', dto).then((r) => r.data),
    onSuccess: () => {
      setEmail('');
      setFullName('');
      setPassword('');
      setRole('REPORTER');
      setError(null);
      setShowForm(false);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? err.message);
    },
  });

  const inputCls =
    'w-full rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30 transition';

  if (isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Users</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-400 transition hover:bg-brand-500/20"
        >
          {showForm ? 'Cancel' : '+ New user'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim() || !fullName.trim() || !password.trim()) return;
              create.mutate({ email: email.trim(), fullName: fullName.trim(), password, role });
            }}
            className="mb-4 overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" className={inputCls} required />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Full name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className={inputCls} required />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Password (min 12 chars)</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" className={inputCls} required minLength={12} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={create.isPending}
                className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                {create.isPending ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="overflow-hidden rounded-xl border border-zinc-800/60">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Protected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {(data ?? []).map((u) => (
              <tr key={u.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 text-zinc-200">{u.email}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{u.fullName ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-400">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-400">{u.isActive ? '✓' : '✗'}</td>
                <td className="px-4 py-3 text-zinc-400">{u.isProtected ? '🔒' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PrioritiesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['priorities'],
    queryFn: () => api.get<PriorityDto[]>('/priorities').then((r) => r.data),
  });
  if (isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;
  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-white">Priority catalog</h3>
      <ul className="space-y-2">
        {(data ?? []).map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4"
          >
            <div className="flex items-center gap-3">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{
                  backgroundColor: p.color,
                  boxShadow: `0 0 12px ${p.color}80`,
                }}
              />
              <div>
                <div className="text-sm font-medium text-white">{p.name}</div>
                <div className="text-xs text-zinc-500">{p.description}</div>
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600">
              level {p.level}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SystemConfigTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: () =>
      api
        .get<{ key: string; value: string; description: string }[]>(
          '/config/system',
        )
        .then((r) => r.data),
  });
  if (isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;
  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-white">System config</h3>
      <div className="overflow-hidden rounded-xl border border-zinc-800/60">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {(data ?? []).map((c) => (
              <tr key={c.key} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 font-mono text-[11px] text-brand-400">
                  {c.key}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-zinc-200">
                  {c.value}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  {c.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface AuditRow {
  id: string;
  actorType: string;
  action: string;
  entity: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Human-readable summary built from before/after/metadata. */
function auditSummary(row: AuditRow): string {
  const before = row.before as Record<string, string> | null;
  const after = row.after as Record<string, string> | null;
  const meta = row.metadata as Record<string, string> | null;

  if (row.action === 'STATUS_CHANGE' && before?.status && after?.status) {
    const via = meta?.eventType ? ` via ${meta.eventType.replace(/_/g, ' ')}` : '';
    const branch = meta?.branch ? ` on ${meta.branch}` : '';
    return `${before.status} → ${after.status}${via}${branch}`;
  }
  if (row.action === 'INTAKE_FINALIZED') {
    return `Intake finalized → "${meta?.title ?? '?'}" (${meta?.priority ?? '?'})`;
  }
  if (row.action === 'TRIAGE_COMPLETED') {
    return `Triage completed → priority ${meta?.assignedPriority ?? '?'}, root cause identified`;
  }
  if (row.action === 'JIRA_TICKET_CREATED') {
    return `Jira ticket created → ${meta?.jiraKey ?? '?'}`;
  }
  if (row.action === 'GITHUB_BRANCH_CREATED') {
    return `Branch created → ${meta?.branch ?? '?'} from ${meta?.baseBranch ?? '?'}`;
  }
  if (row.action === 'NOTIFICATION_SENT') {
    return `Team notified via ${meta?.channels ?? 'email + slack'}`;
  }
  if (row.action === 'ATTACHMENT_UPLOADED') {
    return `Attachment uploaded to GCS`;
  }
  if (row.action === 'INCIDENT_RESOLVED') {
    return `Incident resolved — resolution email sent`;
  }
  if (row.action === 'CREATE') return `Created ${row.entity.toLowerCase()}`;
  if (row.action === 'UPDATE') return `Updated ${row.entity.toLowerCase()}`;
  if (row.action === 'DELETE') return `Deleted ${row.entity.toLowerCase()}`;
  return row.action.replace(/_/g, ' ').toLowerCase();
}

/* ── Incident preview modal ──────────────────────────────────── */

function IncidentPreviewModal({
  incidentId,
  onClose,
}: {
  incidentId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data: incident, isLoading } = useQuery({
    queryKey: ['incidents', incidentId],
    queryFn: () =>
      api.get<IncidentDto>(`/incidents/${incidentId}`).then((r) => r.data),
    enabled: !!incidentId,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
        >
          <X size={16} />
        </button>

        {isLoading || !incident ? (
          <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
            Loading incident…
          </div>
        ) : (
          <div className="p-6">
            {/* header */}
            <div className="mb-1 flex items-center gap-2">
              <PriorityBadge name={incident.priorityName} />
              <StatusBadge status={incident.status} size="md" />
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {incident.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" /> {incident.reporterEmail}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />{' '}
                {new Date(incident.createdAt).toLocaleString()}
              </span>
              <span className="font-mono text-zinc-400">{incident.service}</span>
            </div>

            {/* description */}
            <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Description
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {incident.description}
              </p>
            </div>

            {/* triage summary */}
            {incident.triageSummary && (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
                    SRE Agent Triage
                  </h3>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
                  {incident.triageSummary}
                </pre>
              </div>
            )}

            {/* links */}
            {(incident.jiraTicketUrl || incident.githubBranch) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {incident.jiraTicketUrl && (
                  <a
                    href={incident.jiraTicketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-brand-400 transition hover:border-brand-500/40"
                  >
                    <Ticket className="h-3.5 w-3.5" />
                    {incident.jiraTicketKey}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                {incident.githubBranch && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-[11px] text-zinc-300">
                    <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
                    {incident.githubBranch}
                  </div>
                )}
              </div>
            )}

            {/* full detail link */}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => navigate(`/incidents/${incidentId}`)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500/10 px-4 py-2 text-xs font-medium text-brand-400 transition hover:bg-brand-500/20"
              >
                View full detail
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/** All known action values for the filter dropdown. */
const AUDIT_ACTIONS = [
  'INTAKE_FINALIZED',
  'TRIAGE_COMPLETED',
  'JIRA_TICKET_CREATED',
  'GITHUB_BRANCH_CREATED',
  'NOTIFICATION_SENT',
  'ATTACHMENT_UPLOADED',
  'STATUS_CHANGE',
  'INCIDENT_RESOLVED',
  'CREATE',
  'UPDATE',
  'DELETE',
] as const;

function AuditTab() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  /* ── filters ────────────────────────────────────────────────── */
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () =>
      api.get<{ items: AuditRow[]; total: number }>('/audit?take=200').then((r) => r.data),
  });

  if (isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;

  /* ── client-side filtering ─────────────────────────────────── */
  const rows = (data?.items ?? []).filter((row) => {
    if (actionFilter && row.action !== actionFilter) return false;

    if (dateFrom) {
      const from = new Date(dateFrom);
      if (new Date(row.createdAt) < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(row.createdAt) > to) return false;
    }

    if (search) {
      const q = search.toLowerCase();
      const haystack = [
        row.actorType,
        row.action,
        row.entity,
        row.entityId,
        auditSummary(row),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  const inputCls =
    'rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30 transition';

  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-white">Audit log</h3>

      {/* ── filter bar ───────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search logs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(inputCls, 'w-56')}
        />

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className={cn(inputCls, 'w-40')}
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
          <span>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={cn(inputCls, 'w-32')}
          />
          <span>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={cn(inputCls, 'w-32')}
          />
        </div>

        {(search || actionFilter || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSearch('');
              setActionFilter('');
              setDateFrom('');
              setDateTo('');
            }}
            className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-[10px] text-zinc-600">
          {rows.length} result{rows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── table ────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-zinc-800/60">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="w-8 px-2 py-3" />
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Summary</th>
              <th className="px-4 py-3">Entity</th>
              <th className="w-8 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {rows.map((row) => {
              const isOpen = expanded === row.id;
              const hasMeta = row.metadata || row.before || row.after;
              const isIncident = row.entity === 'Incident';
              const meta = row.metadata as Record<string, string> | null;

              return (
                <React.Fragment key={row.id}>
                  {/* main row */}
                  <tr className="group hover:bg-zinc-800/30">
                    {/* expand chevron */}
                    <td className="px-2 py-3">
                      {hasMeta && (
                        <button
                          onClick={() => setExpanded(isOpen ? null : row.id)}
                          className="text-zinc-600 transition hover:text-zinc-300"
                        >
                          <ChevronDown
                            size={14}
                            className={cn(
                              'transition-transform',
                              isOpen && 'rotate-180',
                            )}
                          />
                        </button>
                      )}
                    </td>

                    <td className="px-4 py-3 text-[11px] text-zinc-500 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-xs text-zinc-300 whitespace-nowrap">
                      {row.actorType.replace(/_/g, ' ')}
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-brand-400">
                        {row.action}
                      </span>
                    </td>

                    <td className="max-w-xs truncate px-4 py-3 text-xs text-zinc-300">
                      {auditSummary(row)}
                    </td>

                    <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">
                      {isIncident ? (
                        <button
                          onClick={() => setPreviewId(row.entityId)}
                          className="inline-flex items-center gap-1 text-brand-400 transition hover:text-brand-300 hover:underline"
                        >
                          Incident#{row.entityId.slice(0, 8)}
                          <ExternalLink size={10} />
                        </button>
                      ) : (
                        <>
                          {row.entity}#{row.entityId.slice(0, 8)}
                        </>
                      )}
                    </td>

                    <td className="px-2 py-3">
                      {isIncident && (
                        <button
                          onClick={() => setPreviewId(row.entityId)}
                          className="text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-brand-400"
                        >
                          <ArrowRight size={14} />
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* inline detail row — directly below its parent */}
                  {isOpen && hasMeta && (
                    <tr>
                      <td colSpan={7} className="bg-zinc-900/40 px-10 py-3">
                        <AnimatePresence>
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="grid grid-cols-3 gap-4 text-[11px]"
                          >
                            {row.before && (
                              <div>
                                <span className="mb-1 block font-semibold uppercase tracking-wider text-zinc-500">
                                  Before
                                </span>
                                <pre className="whitespace-pre-wrap text-red-400/80">
                                  {JSON.stringify(row.before, null, 2)}
                                </pre>
                              </div>
                            )}
                            {row.after && (
                              <div>
                                <span className="mb-1 block font-semibold uppercase tracking-wider text-zinc-500">
                                  After
                                </span>
                                <pre className="whitespace-pre-wrap text-emerald-400/80">
                                  {JSON.stringify(row.after, null, 2)}
                                </pre>
                              </div>
                            )}
                            {meta && (
                              <div>
                                <span className="mb-1 block font-semibold uppercase tracking-wider text-zinc-500">
                                  Metadata
                                </span>
                                <div className="space-y-1 text-zinc-400">
                                  {meta.eventType && (
                                    <p>
                                      <span className="text-zinc-500">Event:</span>{' '}
                                      {meta.eventType}
                                    </p>
                                  )}
                                  {meta.branch && (
                                    <p>
                                      <span className="text-zinc-500">Branch:</span>{' '}
                                      <span className="font-mono text-brand-400">
                                        {meta.branch}
                                      </span>
                                    </p>
                                  )}
                                  {meta.prUrl && (
                                    <p>
                                      <span className="text-zinc-500">PR:</span>{' '}
                                      <a
                                        href={meta.prUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-brand-400 hover:underline"
                                      >
                                        {meta.prUrl}
                                      </a>
                                    </p>
                                  )}
                                  {meta.mergedBy && (
                                    <p>
                                      <span className="text-zinc-500">Merged by:</span>{' '}
                                      {meta.mergedBy}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-zinc-600">
                  No audit entries match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* incident preview modal */}
      <AnimatePresence>
        {previewId && (
          <IncidentPreviewModal
            incidentId={previewId}
            onClose={() => setPreviewId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
