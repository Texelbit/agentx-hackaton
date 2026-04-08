import { useQuery } from '@tanstack/react-query';
import { PriorityDto, UserDto } from '@sre/shared-types';
import { useState } from 'react';
import { LlmConfigManager } from '../components/LlmConfigManager';
import { api } from '../lib/api';

type Tab = 'users' | 'priorities' | 'system' | 'llm' | 'audit';

const TABS: { id: Tab; label: string }[] = [
  { id: 'users', label: 'Users' },
  { id: 'priorities', label: 'Priorities' },
  { id: 'system', label: 'System config' },
  { id: 'llm', label: 'LLM config' },
  { id: 'audit', label: 'Audit log' },
];

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Administration</h1>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        {tab === 'users' && <UsersTab />}
        {tab === 'priorities' && <PrioritiesTab />}
        {tab === 'system' && <SystemConfigTab />}
        {tab === 'llm' && <LlmConfigTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}

function UsersTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserDto[]>('/users').then((r) => r.data),
  });
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <table className="w-full">
      <thead className="text-left text-xs uppercase text-slate-500">
        <tr>
          <th className="py-2">Email</th>
          <th>Role</th>
          <th>Active</th>
          <th>Protected</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-sm">
        {(data ?? []).map((u) => (
          <tr key={u.id}>
            <td className="py-2">{u.email}</td>
            <td>{u.role}</td>
            <td>{u.isActive ? '✅' : '❌'}</td>
            <td>{u.isProtected ? '🔒' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrioritiesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['priorities'],
    queryFn: () => api.get<PriorityDto[]>('/priorities').then((r) => r.data),
  });
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <ul className="space-y-2">
      {(data ?? []).map((p) => (
        <li
          key={p.id}
          className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
        >
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <div>
              <div className="font-medium text-slate-900">{p.name}</div>
              <div className="text-xs text-slate-500">{p.description}</div>
            </div>
          </div>
          <div className="text-xs text-slate-500">level {p.level}</div>
        </li>
      ))}
    </ul>
  );
}

function SystemConfigTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: () =>
      api
        .get<{ key: string; value: string; description: string }[]>('/config/system')
        .then((r) => r.data),
  });
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-slate-500">
        <tr>
          <th className="py-2">Key</th>
          <th>Value</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {(data ?? []).map((c) => (
          <tr key={c.key}>
            <td className="py-2 font-mono text-xs">{c.key}</td>
            <td className="font-mono text-xs">{c.value}</td>
            <td className="text-slate-500">{c.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LlmConfigTab() {
  // Full Providers / Models / Assignments CRUD lives in its own component
  // because the markup is substantial.
  return <LlmConfigManager />;
}

function AuditTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () =>
      api
        .get<{
          items: { id: string; actorType: string; action: string; entity: string; entityId: string; createdAt: string }[];
          total: number;
        }>('/audit')
        .then((r) => r.data),
  });
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-slate-500">
        <tr>
          <th className="py-2">When</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Entity</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {(data?.items ?? []).map((row) => (
          <tr key={row.id}>
            <td className="py-2 text-xs text-slate-500">
              {new Date(row.createdAt).toLocaleString()}
            </td>
            <td>{row.actorType}</td>
            <td>{row.action}</td>
            <td className="font-mono text-xs">
              {row.entity}#{row.entityId.slice(0, 8)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
