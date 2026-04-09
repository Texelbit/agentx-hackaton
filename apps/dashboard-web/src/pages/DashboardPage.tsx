import { useQuery } from '@tanstack/react-query';
import { IncidentDto, IncidentStatus } from '@sre/shared-types';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PriorityBadge, StatusBadge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { api } from '../lib/api';

function fetchIncidents(): Promise<IncidentDto[]> {
  return api.get<IncidentDto[]>('/incidents').then((r) => r.data);
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: fetchIncidents,
  });

  const incidents = data ?? [];
  const open = incidents.filter(
    (i) =>
      i.status !== IncidentStatus.DONE &&
      i.status !== IncidentStatus.CANCELLED,
  );
  const inReview = incidents.filter((i) => i.status === IncidentStatus.IN_REVIEW);
  const resolved = incidents.filter((i) => i.status === IncidentStatus.DONE);
  const recent = incidents.slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-brand-400">
          <Activity className="h-3.5 w-3.5" />
          <span>Live overview</span>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Good to see you again
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Real-time snapshot of your team's incident response.
        </p>
      </motion.div>

      {/* KPIs */}
      <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <Kpi
              icon={Inbox}
              label="Open incidents"
              value={open.length}
              accent="brand"
              delay={0}
            />
            <Kpi
              icon={Eye}
              label="In review"
              value={inReview.length}
              accent="violet"
              delay={0.05}
            />
            <Kpi
              icon={CheckCircle2}
              label="Resolved"
              value={resolved.length}
              accent="emerald"
              delay={0.1}
            />
          </>
        )}
      </div>

      {/* Recent incidents */}
      <Card
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <div className="flex items-center justify-between border-b border-zinc-800/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Recent incidents</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Latest reports across your org
            </p>
          </div>
          <Link
            to="/incidents"
            className="group flex items-center gap-1 text-xs font-medium text-brand-400 transition hover:text-brand-300"
          >
            View all
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="p-5">
            <SkeletonCard />
          </div>
        ) : recent.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Inbox}
              title="No incidents yet"
              description="When someone reports a new issue, it will show up here."
            />
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {recent.map((i, idx) => (
              <motion.li
                key={i.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + idx * 0.03 }}
              >
                <Link
                  to={`/incidents/${i.id}`}
                  className="group flex items-center gap-4 px-5 py-4 transition hover:bg-zinc-800/30"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800/80 ring-1 ring-zinc-700/60">
                    <Clock className="h-4 w-4 text-zinc-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-100 group-hover:text-white">
                      {i.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                      <span className="font-mono">{i.service}</span>
                      <span>·</span>
                      <span>{new Date(i.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PriorityBadge name={i.priorityName} />
                    <StatusBadge status={i.status} />
                    <ArrowRight className="h-4 w-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const ACCENT_STYLES: Record<
  string,
  { bg: string; ring: string; icon: string; number: string }
> = {
  brand: {
    bg: 'from-brand-500/10 to-transparent',
    ring: 'ring-brand-500/20',
    icon: 'bg-brand-500/10 text-brand-400',
    number: 'text-white',
  },
  violet: {
    bg: 'from-violet-500/10 to-transparent',
    ring: 'ring-violet-500/20',
    icon: 'bg-violet-500/10 text-violet-400',
    number: 'text-white',
  },
  emerald: {
    bg: 'from-emerald-500/10 to-transparent',
    ring: 'ring-emerald-500/20',
    icon: 'bg-emerald-500/10 text-emerald-400',
    number: 'text-white',
  },
};

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
  delay,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  accent: keyof typeof ACCENT_STYLES;
  delay: number;
}) {
  const style = ACCENT_STYLES[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 200, damping: 20 }}
      whileHover={{ y: -2 }}
      className={`group relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-gradient-to-br ${style.bg} p-5 ring-1 ${style.ring} transition-colors hover:border-zinc-700/80`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {label}
          </div>
          <motion.div
            key={value}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-3 text-4xl font-semibold tabular-nums tracking-tight ${style.number}`}
          >
            {value}
          </motion.div>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${style.icon}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}
