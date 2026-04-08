import { IncidentStatus } from '@sre/shared-types';

const STATUS_STYLES: Record<IncidentStatus, string> = {
  BACKLOG: 'bg-slate-200 text-slate-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  IN_REVIEW: 'bg-purple-100 text-purple-800',
  READY_TO_TEST: 'bg-amber-100 text-amber-800',
  DONE: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-blue-100 text-blue-800',
  INFO: 'bg-slate-100 text-slate-700',
};

export function PriorityBadge({ name }: { name: string }) {
  const cls = PRIORITY_COLORS[name] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{name}</span>
  );
}
