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
import { api } from '../lib/api';

/**
 * LLM configuration manager. Three sub-sections inside one tab:
 *
 *   1. Providers   — CRUD over llm_providers
 *   2. Models      — CRUD over llm_models (filtered by provider)
 *   3. Assignments — pick which model each agent role uses
 *
 * All three are kept on a single screen so admins can see the full picture
 * (which model is used by which agent role + the underlying provider) at a
 * glance, without navigating away.
 */
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
      <h3 className="mb-3 text-base font-semibold text-slate-900">
        1. Providers
      </h3>
      <p className="mb-3 text-xs text-slate-500">
        A provider record links a friendly name to one of the supported strategy
        kinds (GEMINI / OPENAI / ANTHROPIC). API keys live in env vars, not here.
      </p>

      <form
        onSubmit={handleCreate}
        className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
      >
        <label className="flex flex-col">
          <span className="text-xs text-slate-600">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="OpenAI Production"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-slate-600">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LlmProviderKind)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {Object.values(LlmProviderKind).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Add provider
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : providers.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          No providers yet. Add one above.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Name</th>
              <th>Kind</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {providers.map((p) => (
              <tr key={p.id}>
                <td className="py-2">{p.name}</td>
                <td>{p.kind}</td>
                <td>
                  <button
                    onClick={() => toggleActive.mutate(p)}
                    className="rounded px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: p.active ? '#d1fae5' : '#fee2e2',
                      color: p.active ? '#065f46' : '#991b1b',
                    }}
                  >
                    {p.active ? '✓ active' : '✗ inactive'}
                  </button>
                </td>
                <td className="text-right">
                  <button
                    onClick={() => {
                      if (confirm(`Delete provider "${p.name}"?`)) {
                        remove.mutate(p.id);
                      }
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <h3 className="mb-3 text-base font-semibold text-slate-900">2. Models</h3>
      <p className="mb-3 text-xs text-slate-500">
        Each model belongs to one provider. <code>name</code> is the friendly
        label, <code>value</code> is the actual API model identifier
        (e.g. <code>gemini-2.5-flash</code>).
      </p>

      <form
        onSubmit={handleCreate}
        className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
      >
        <label className="flex flex-col">
          <span className="text-xs text-slate-600">Provider</span>
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">— pick a provider —</option>
            {providers
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-slate-600">Display name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Gemini 2.5 Flash"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-slate-600">API model id</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="gemini-2.5-flash"
            className="rounded border border-slate-300 px-2 py-1 text-sm font-mono"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || !providerId || !name.trim() || !value.trim()}
          className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Add model
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : models.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          No models yet. Add one above.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Provider</th>
              <th>Display name</th>
              <th>API model id</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {models.map((m) => (
              <tr key={m.id}>
                <td className="py-2">{providerName(m.providerId)}</td>
                <td>{m.name}</td>
                <td className="font-mono text-xs">{m.value}</td>
                <td>
                  <button
                    onClick={() => toggleActive.mutate(m)}
                    className="rounded px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: m.active ? '#d1fae5' : '#fee2e2',
                      color: m.active ? '#065f46' : '#991b1b',
                    }}
                  >
                    {m.active ? '✓ active' : '✗ inactive'}
                  </button>
                </td>
                <td className="text-right">
                  <button
                    onClick={() => {
                      if (confirm(`Delete model "${m.name}"?`)) {
                        remove.mutate(m.id);
                      }
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <h3 className="mb-3 text-base font-semibold text-slate-900">
        3. Agent role assignments
      </h3>
      <p className="mb-3 text-xs text-slate-500">
        Pick which model each agent role uses. Changes take effect immediately
        (the cache is invalidated server-side).
      </p>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Agent role</th>
              <th>Current model</th>
              <th>Reassign to</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.values(AgentRole).map((role) => {
              const current = assignments.find((a) => a.agentRole === role);
              return (
                <tr key={role}>
                  <td className="py-2 font-medium">{role}</td>
                  <td>
                    {current ? (
                      <span>
                        <span className="font-mono text-xs text-indigo-700">
                          {current.modelValue}
                        </span>
                        <span className="ml-2 text-xs text-slate-500">
                          ({current.providerName})
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600">
                        not assigned
                      </span>
                    )}
                  </td>
                  <td>
                    <select
                      value={current?.modelId ?? ''}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        assign.mutate({
                          role,
                          modelId: e.target.value,
                        });
                      }}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
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
      )}
    </section>
  );
}
