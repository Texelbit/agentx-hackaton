import { useQuery } from '@tanstack/react-query';
import { IncidentDto, IncidentStatus } from '@sre/shared-types';
import { motion } from 'framer-motion';
import { Bug, ExternalLink, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PriorityBadge, StatusBadge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { cn } from '../components/ui/cn';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonRow } from '../components/ui/Skeleton';
import { api } from '../lib/api';

function fetchIncidents(): Promise<IncidentDto[]> {
  return api.get<IncidentDto[]>('/incidents').then((r) => r.data);
}

const STATUS_FILTERS: (IncidentStatus | 'ALL')[] = [
  'ALL',
  IncidentStatus.BACKLOG,
  IncidentStatus.IN_PROGRESS,
  IncidentStatus.IN_REVIEW,
  IncidentStatus.READY_TO_TEST,
  IncidentStatus.DONE,
];

export function IncidentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: fetchIncidents,
  });
  const [filter, setFilter] = useState<IncidentStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const incidents = useMemo(() => {
    let list = data ?? [];
    if (filter !== 'ALL') list = list.filter((i) => i.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.service.toLowerCase().includes(q) ||
          (i.jiraTicketKey?.toLowerCase().includes(q) ?? false),
      );
    }
    return list;
  }, [data, filter, search]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Incidents
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Browse, filter and dive into every incident the team is handling.
        </p>
      </motion.div>

      {/* Toolbar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, service, ticket..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-600 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                filter === f
                  ? 'bg-brand-600 text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4),0_0_20px_-4px_rgba(99,102,241,0.4)]'
                  : 'bg-zinc-900/60 text-zinc-400 ring-1 ring-zinc-800 hover:bg-zinc-800/60 hover:text-zinc-200',
              )}
            >
              {f === 'ALL' ? 'All' : f.replace(/_/g, ' ').toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="p-5">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Bug}
              title="No incidents match"
              description={
                search
                  ? 'Try a different search term or clear the filters.'
                  : 'Reports will appear here in real time.'
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {incidents.map((i, idx) => (
              <motion.li
                key={i.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
              >
                <Link
                  to={`/incidents/${i.id}`}
                  className="group flex items-start gap-4 px-5 py-4 transition hover:bg-zinc-800/30"
                >
                  {/* Priority bar */}
                  <PriorityBar name={i.priorityName} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-medium text-white">
                        {i.title}
                      </h3>
                      <StatusBadge status={i.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                      <span className="font-mono text-zinc-400">{i.service}</span>
                      <span>·</span>
                      <span>{new Date(i.createdAt).toLocaleString()}</span>
                      {i.jiraTicketKey && i.jiraTicketUrl && (
                        <>
                          <span>·</span>
                          <a
                            href={i.jiraTicketUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-brand-400 hover:text-brand-300"
                          >
                            {i.jiraTicketKey}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    <PriorityBadge name={i.priorityName} />
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

function PriorityBar({ name }: { name: string }) {
  const colors: Record<string, string> = {
    CRITICAL: 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]',
    HIGH: 'bg-orange-500',
    MEDIUM: 'bg-yellow-500',
    LOW: 'bg-blue-500',
    INFO: 'bg-zinc-600',
  };
  return (
    <div className="flex h-full items-stretch">
      <div className={cn('w-1 rounded-full', colors[name] ?? colors.INFO)} />
    </div>
  );
}
