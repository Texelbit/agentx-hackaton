import { useQuery } from '@tanstack/react-query';
import { PriorityDto, UserDto } from '@sre/shared-types';
import { motion } from 'framer-motion';
import {
  Bot,
  Cog,
  GitBranch,
  ListChecks,
  ScrollText,
  type LucideIcon,
  Users,
} from 'lucide-react';
import { useState } from 'react';
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

function UsersTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserDto[]>('/users').then((r) => r.data),
  });
  if (isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;
  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-white">Users</h3>
      <div className="overflow-hidden rounded-xl border border-zinc-800/60">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Protected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {(data ?? []).map((u) => (
              <tr key={u.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 text-zinc-200">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-400">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">{u.isActive ? '✓' : '✗'}</td>
                <td className="px-4 py-3">{u.isProtected ? '🔒' : ''}</td>
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

function AuditTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () =>
      api
        .get<{
          items: {
            id: string;
            actorType: string;
            action: string;
            entity: string;
            entityId: string;
            createdAt: string;
          }[];
          total: number;
        }>('/audit')
        .then((r) => r.data),
  });
  if (isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;
  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-white">Audit log</h3>
      <div className="overflow-hidden rounded-xl border border-zinc-800/60">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {(data?.items ?? []).map((row) => (
              <tr key={row.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 text-[11px] text-zinc-500">
                  {new Date(row.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-300">
                  {row.actorType}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-brand-400">
                    {row.action}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">
                  {row.entity}#{row.entityId.slice(0, 8)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
