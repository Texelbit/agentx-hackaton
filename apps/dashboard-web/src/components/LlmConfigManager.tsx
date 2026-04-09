import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AgentRole,
  CreateLlmModelDto,
  CreateLlmProviderDto,
  LlmAssignmentDto,
  LlmModelDto,
  LlmProviderDto,
  LlmProviderKind,
} from '@sre/shared-types';
import { FormEvent, useState } from 'react';
import { cn } from './ui/cn';
import { api } from '../lib/api';

export function LlmConfigManager() {
  const queryClient = useQueryClient();

  const providersQuery = useQuery({
    queryKey: ['llm-providers'],
    queryFn: () =>
      api.get<LlmProviderDto[]>('/config/llm/providers').then((r) => r.data),
  });

  const modelsQuery = useQuery({
    queryKey: ['llm-models'],
    queryFn: () =>
      api.get<LlmModelDto[]>('/config/llm/models').then((r) => r.data),
  });

  const assignmentsQuery = useQuery({
    queryKey: ['llm-assignments'],
    queryFn: () =>
      api
        .get<LlmAssignmentDto[]>('/config/llm/assignments')
        .then((r) => r.data),
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
    void queryClient.invalidateQueries({ queryKey: ['llm-models'] });
    void queryClient.invalidateQueries({ queryKey: ['llm-assignments'] });
  };

  return (
    <div className="space-y-8">
      <ProvidersSection
        providers={providersQuery.data ?? []}
        loading={providersQuery.isLoading}
        onChange={refresh}
      />
      <ModelsSection
        providers={providersQuery.data ?? []}
        models={modelsQuery.data ?? []}
        loading={modelsQuery.isLoading}
        onChange={refresh}
      />
      <AssignmentsSection
        assignments={assignmentsQuery.data ?? []}
        models={modelsQuery.data ?? []}
        providers={providersQuery.data ?? []}
        loading={assignmentsQuery.isLoading}
        onChange={refresh}
      />
    </div>
  );
}

const inputCls =
  'rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30 transition';

const btnPrimary =
  'rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-600 disabled:opacity-50';

// ── Providers ──────────────────────────────────────────────────────────

function ProvidersSection({
  providers,
  loading,
  onChange,
}: {
  providers: LlmProviderDto[];
  loading: boolean;
  onChange: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LlmProviderKind>(LlmProviderKind.GEMINI);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (dto: CreateLlmProviderDto) =>
      api.post<LlmProviderDto>('/config/llm/providers', dto).then((r) => r.data),
    onSuccess: () => {
      setName('');
      setError(null);
      onChange();
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) =>
      setError(err.response?.data?.message ?? err.message),
  });

  const toggleActive = useMutation({
    mutationFn: (p: LlmProviderDto) =>
      api
        .patch<LlmProviderDto>(`/config/llm/providers/${p.id}`, {
          active: !p.active,
        })
        .then((r) => r.data),
    onSuccess: onChange,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/config/llm/providers/${id}`),
    onSuccess: onChange,
    onError: (err: Error & { response?: { data?: { message?: string } } }) =>
      alert(err.response?.data?.message ?? err.message),
  });

  function handleCreate(e: FormEvent): void {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), kind });
  }

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-white">1. Providers</h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Each provider maps to a strategy (GEMINI / OPENAI / ANTHROPIC). API keys
        live in env vars.
      </p>

      <form
        onSubmit={handleCreate}
        className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Google Gemini"
            className={cn(inputCls, 'w-48')}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LlmProviderKind)}
            className={cn(inputCls, 'w-36')}
          >
            {Object.values(LlmProviderKind).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={create.isPending || !name.trim()} className={btnPrimary}>
          Add provider
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </form>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : providers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700/60 p-6 text-center text-xs text-zinc-600">
          No providers yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800/60">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {providers.map((p) => (
                <tr key={p.id} className="group hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-200">{p.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                      {p.kind}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive.mutate(p)}
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition',
                        p.active
                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
                      )}
                    >
                      {p.active ? '● active' : '○ inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Delete provider "${p.name}"?`))
                          remove.mutate(p.id);
                      }}
                      className="text-[10px] text-red-400/60 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Models ─────────────────────────────────────────────────────────────

function ModelsSection({
  providers,
  models,
  loading,
  onChange,
}: {
  providers: LlmProviderDto[];
  models: LlmModelDto[];
  loading: boolean;
  onChange: () => void;
}) {
  const [providerId, setProviderId] = useState('');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (dto: CreateLlmModelDto) =>
      api.post<LlmModelDto>('/config/llm/models', dto).then((r) => r.data),
    onSuccess: () => {
      setName('');
      setValue('');
      setError(null);
      onChange();
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) =>
      setError(err.response?.data?.message ?? err.message),
  });

  const toggleActive = useMutation({
    mutationFn: (m: LlmModelDto) =>
      api
        .patch<LlmModelDto>(`/config/llm/models/${m.id}`, { active: !m.active })
        .then((r) => r.data),
    onSuccess: onChange,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/config/llm/models/${id}`),
    onSuccess: onChange,
    onError: (err: Error & { response?: { data?: { message?: string } } }) =>
      alert(err.response?.data?.message ?? err.message),
  });

  function handleCreate(e: FormEvent): void {
    e.preventDefault();
    if (!providerId || !name.trim() || !value.trim()) return;
    create.mutate({ providerId, name: name.trim(), value: value.trim() });
  }

  const providerName = (id: string): string =>
    providers.find((p) => p.id === id)?.name ?? '?';

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-white">2. Models</h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Each model belongs to one provider. <code className="text-brand-400">value</code> is the
        real API model id (e.g. <code className="text-brand-400">gemini-2.5-pro</code>).
      </p>

      <form
        onSubmit={handleCreate}
        className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Provider</span>
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className={cn(inputCls, 'w-44')}
          >
            <option value="">— pick —</option>
            {providers
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Display name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Gemini 2.5 Pro"
            className={cn(inputCls, 'w-40')}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">API model id</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="gemini-2.5-pro"
            className={cn(inputCls, 'w-44 font-mono')}
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || !providerId || !name.trim() || !value.trim()}
          className={btnPrimary}
        >
          Add model
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </form>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : models.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700/60 p-6 text-center text-xs text-zinc-600">
          No models yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800/60">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Display name</th>
                <th className="px-4 py-3">API model id</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {models.map((m) => (
                <tr key={m.id} className="group hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {providerName(m.providerId)}
                  </td>
                  <td className="px-4 py-3 text-zinc-200">{m.name}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-brand-400">
                    {m.value}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive.mutate(m)}
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition',
                        m.active
                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
                      )}
                    >
                      {m.active ? '● active' : '○ inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Delete model "${m.name}"?`))
                          remove.mutate(m.id);
                      }}
                      className="text-[10px] text-red-400/60 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Assignments (agent role → model) ──────────────────────────────────

function AssignmentsSection({
  assignments,
  models,
  providers,
  loading,
  onChange,
}: {
  assignments: LlmAssignmentDto[];
  models: LlmModelDto[];
  providers: LlmProviderDto[];
  loading: boolean;
  onChange: () => void;
}) {
  const assign = useMutation({
    mutationFn: (args: { role: AgentRole; modelId: string }) =>
      api.patch(`/config/llm/assignments/${args.role}`, {
        modelId: args.modelId,
      }),
    onSuccess: onChange,
    onError: (err: Error & { response?: { data?: { message?: string } } }) =>
      alert(err.response?.data?.message ?? err.message),
  });

  const activeModels = models.filter((m) => {
    if (!m.active) return false;
    const provider = providers.find((p) => p.id === m.providerId);
    return provider?.active ?? false;
  });

  const providerName = (id: string): string =>
    providers.find((p) => p.id === id)?.name ?? '?';

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-white">
        3. Agent role assignments
      </h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Pick which model each agent role uses. Changes take effect immediately.
      </p>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800/60">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Agent role</th>
                <th className="px-4 py-3">Current model</th>
                <th className="px-4 py-3">Reassign to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {Object.values(AgentRole).map((role) => {
                const current = assignments.find((a) => a.agentRole === role);
                return (
                  <tr key={role} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-medium text-zinc-200">
                      {role.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3">
                      {current ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-mono text-[11px] text-brand-400">
                            {current.modelValue}
                          </span>
                          <span className="text-[10px] text-zinc-600">
                            ({current.providerName})
                          </span>
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                          not assigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={current?.modelId ?? ''}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          assign.mutate({ role, modelId: e.target.value });
                        }}
                        className={cn(inputCls, 'w-full text-xs')}
                      >
                        <option value="">— pick a model —</option>
                        {activeModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {providerName(m.providerId)} · {m.name} ({m.value})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
