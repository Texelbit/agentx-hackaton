import { IncidentStatus } from '@sre/shared-types';
import { cn } from './cn';

const STATUS_CONFIG: Record<
  IncidentStatus,
  { label: string; dot: string; bg: string; text: string }
> = {
  BACKLOG: {
    label: 'Backlog',
    dot: 'bg-zinc-500',
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
  },
  IN_PROGRESS: {
    label: 'In progress',
    dot: 'bg-blue-500',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
  },
  IN_REVIEW: {
    label: 'In review',
    dot: 'bg-violet-500',
    bg: 'bg-violet-500/10',
    text: 'text-violet-400',
  },
  READY_TO_TEST: {
    label: 'Ready to test',
    dot: 'bg-amber-500',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
  },
  DONE: {
    label: 'Done',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
  },
  CANCELLED: {
    label: 'Cancelled',
    dot: 'bg-red-500',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
  },
};

export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: IncidentStatus;
  size?: 'sm' | 'md';
}) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        cfg.bg,
        cfg.text,
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

const PRIORITY_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  CRITICAL: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
  },
  HIGH: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-500' },
  MEDIUM: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  LOW: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-500' },
  INFO: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: 'bg-zinc-500' },
};

export function PriorityBadge({ name }: { name: string }) {
  const cfg = PRIORITY_CONFIG[name] ?? PRIORITY_CONFIG.INFO;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
        cfg.bg,
        cfg.text,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {name}
    </span>
  );
}

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60',
    brand: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
