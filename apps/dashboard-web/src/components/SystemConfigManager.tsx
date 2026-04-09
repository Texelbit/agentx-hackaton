import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SystemConfigEntryDto } from '@sre/shared-types';
import { motion } from 'framer-motion';
import { Check, Pencil, Settings2, X } from 'lucide-react';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { cn } from './ui/cn';
import { EmptyState } from './ui/EmptyState';

/**
 * System config CRUD with inline editing. Click a value → it becomes an
 * input → Enter or click ✓ to save, Esc or click ✗ to cancel.
 *
 * Each row shows the key (mono brand-colored), value (mono editable) and
 * a human description so admins know what they're tweaking before saving.
 */
export function SystemConfigManager() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['system-config'],
    queryFn: () =>
      api
        .get<SystemConfigEntryDto[]>('/config/system')
        .then((r) => r.data),
  });

  const update = useMutation({
    mutationFn: (args: { key: string; value: string }) =>
      api
        .patch(`/config/system/${args.key}`, { value: args.value })
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['system-config'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) =>
      alert(err.response?.data?.message ?? err.message),
  });

  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-base font-semibold text-white">System config</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          Runtime configuration. Click any value to edit it inline. Changes
          take effect immediately — the backend cache is invalidated server-side.
        </p>
      </header>

      {query.isLoading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (query.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Settings2}
          title="No system config"
          description="Run `npm run seed:bootstrap` to populate defaults."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950/80 text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {query.data!.map((entry) => (
                <ConfigRow
                  key={entry.key}
                  entry={entry}
                  saving={update.isPending}
                  onSave={(value) => update.mutate({ key: entry.key, value })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Row with inline edit ──────────────────────────────────────────────

function ConfigRow({
  entry,
  saving,
  onSave,
}: {
  entry: SystemConfigEntryDto;
  saving: boolean;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset draft if the underlying value changes (e.g. another tab updated it)
  useEffect(() => {
    if (!editing) setDraft(entry.value);
  }, [entry.value, editing]);

  // Auto-focus + select all when entering edit mode
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit(): void {
    const next = draft.trim();
    if (next === entry.value) {
      setEditing(false);
      return;
    }
    onSave(next);
    setEditing(false);
  }

  function cancel(): void {
    setDraft(entry.value);
    setEditing(false);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  return (
    <tr className="group hover:bg-zinc-900/40">
      <td className="px-4 py-3 align-top">
        <code className="font-mono text-[11px] text-brand-400">{entry.key}</code>
      </td>
      <td className="px-4 py-3 align-top">
        {editing ? (
          <motion.div
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1.5"
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              disabled={saving}
              className="flex-1 rounded-md border border-brand-500/40 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <button
              type="button"
              onClick={commit}
              disabled={saving}
              className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
              title="Save (Enter)"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="rounded-md bg-zinc-800 p-1.5 text-zinc-400 transition hover:bg-zinc-700 disabled:opacity-50"
              title="Cancel (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group/value inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-zinc-100 transition hover:bg-zinc-800/60"
            title="Click to edit"
          >
            <span>{entry.value}</span>
            <Pencil className="h-3 w-3 text-zinc-600 opacity-0 transition group-hover/value:opacity-100" />
          </button>
        )}
      </td>
      <td className="px-4 py-3 align-top text-xs text-zinc-500">
        {entry.description}
      </td>
    </tr>
  );
}
