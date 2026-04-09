import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IncidentDto,
  IncidentLinkStatus,
  IncidentStatus,
  SimilarIncidentDto,
} from '@sre/shared-types';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Link2,
  Sparkles,
  Ticket,
  User,
  XCircle,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PriorityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cn } from '../components/ui/cn';
import { api } from '../lib/api';

function fetchIncident(id: string): Promise<IncidentDto> {
  return api.get<IncidentDto>(`/incidents/${id}`).then((r) => r.data);
}

function fetchSimilar(id: string): Promise<SimilarIncidentDto[]> {
  return api
    .get<SimilarIncidentDto[]>(`/incidents/${id}/similar`)
    .then((r) => r.data);
}

export function IncidentDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: incident } = useQuery({
    queryKey: ['incidents', id],
    queryFn: () => fetchIncident(id),
    enabled: !!id,
  });

  const { data: similar } = useQuery({
    queryKey: ['incidents', id, 'similar'],
    queryFn: () => fetchSimilar(id),
    enabled: !!id,
  });

  const updateStatus = useMutation({
    mutationFn: (status: IncidentStatus) =>
      api.patch(`/incidents/${id}`, { status }).then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
  });

  const updateLink = useMutation({
    mutationFn: (args: { linkId: string; status: 'CONFIRMED' | 'REJECTED' }) =>
      api
        .patch(`/incidents/${id}/links/${args.linkId}`, { status: args.status })
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['incidents', id, 'similar'] });
    },
  });

  if (!incident) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Loading incident…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <Link
        to="/incidents"
        className="group inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        Back to incidents
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 mt-4"
      >
        <div className="mb-3 flex items-center gap-2">
          <PriorityBadge name={incident.priorityName} />
          <StatusBadge status={incident.status} size="md" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          {incident.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            {incident.reporterEmail}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(incident.createdAt).toLocaleString()}
          </span>
          <span className="font-mono text-zinc-400">{incident.service}</span>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Description */}
          <Card
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="border-b border-zinc-800 px-6 py-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Description
              </h2>
            </div>
            <div className="p-6">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {incident.description}
              </p>
            </div>
          </Card>

          {/* Triage */}
          {incident.triageSummary && (
            <Card
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center gap-2 border-b border-zinc-800 px-6 py-4">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500/10 text-brand-400">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  SRE Agent triage
                </h2>
              </div>
              <div className="p-6">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
                  {incident.triageSummary}
                </pre>
              </div>
            </Card>
          )}

          {/* Similar incidents */}
          {similar && similar.length > 0 && (
            <Card
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-brand-400" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Similar past incidents
                  </h2>
                  <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-400">
                    {similar.length}
                  </span>
                </div>
              </div>
              <div className="p-6">
                <p className="mb-4 text-xs text-zinc-500">
                  Detected via embedding similarity. Confirm or reject to
                  curate your team's knowledge base.
                </p>
                <ul className="space-y-2">
                  {similar.map((l, idx) => (
                    <SimilarItem
                      key={l.linkId}
                      link={l}
                      delay={0.2 + idx * 0.04}
                      onConfirm={() =>
                        updateLink.mutate({ linkId: l.linkId, status: 'CONFIRMED' })
                      }
                      onReject={() =>
                        updateLink.mutate({ linkId: l.linkId, status: 'REJECTED' })
                      }
                    />
                  ))}
                </ul>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="border-b border-zinc-800 px-6 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Links
              </h3>
            </div>
            <div className="space-y-2 p-6 text-sm">
              {incident.jiraTicketUrl && (
                <a
                  href={incident.jiraTicketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 transition hover:border-brand-500/40 hover:bg-brand-500/5"
                >
                  <Ticket className="h-4 w-4 text-brand-400" />
                  <span className="flex-1 font-mono text-xs text-zinc-300">
                    {incident.jiraTicketKey}
                  </span>
                  <ExternalLink className="h-3 w-3 text-zinc-600 group-hover:text-brand-400" />
                </a>
              )}
              {incident.githubBranch && (
                <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                  <GitBranch className="h-4 w-4 text-emerald-400" />
                  <span className="truncate font-mono text-[11px] text-zinc-300">
                    {incident.githubBranch}
                  </span>
                </div>
              )}
            </div>
          </Card>

          <Card
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
          >
            <div className="border-b border-zinc-800 px-6 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Change status
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2 p-6">
              {Object.values(IncidentStatus).map((s) => {
                const isActive = s === incident.status;
                return (
                  <button
                    key={s}
                    onClick={() => updateStatus.mutate(s)}
                    disabled={isActive || updateStatus.isPending}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-[11px] font-medium transition',
                      isActive
                        ? 'border-brand-500/40 bg-brand-500/10 text-brand-300'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800/60 hover:text-zinc-200',
                      'disabled:cursor-not-allowed',
                    )}
                  >
                    {s.replace(/_/g, ' ').toLowerCase()}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SimilarItem({
  link,
  delay,
  onConfirm,
  onReject,
}: {
  link: SimilarIncidentDto;
  delay: number;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const pct = (link.similarity * 100).toFixed(0);
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="group rounded-xl border border-zinc-800 bg-zinc-950 p-3 transition hover:border-brand-500/30 hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/incidents/${link.peerId}`}
              className="truncate text-sm font-medium text-zinc-100 group-hover:text-white"
            >
              {link.peerTitle}
            </Link>
            <span className="shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-brand-400">
              {pct}% match
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PriorityBadge name={link.peerPriorityName} />
            <StatusBadge status={link.peerStatus} />
            {link.peerJiraUrl && (
              <a
                href={link.peerJiraUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300"
              >
                <Ticket className="h-3 w-3" />
                {link.peerJiraKey}
              </a>
            )}
            <span className="text-[11px] text-zinc-600">
              {new Date(link.peerCreatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        {link.status === IncidentLinkStatus.SUGGESTED ? (
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="primary"
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              onClick={onConfirm}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<XCircle className="h-3.5 w-3.5" />}
              onClick={onReject}
            >
              Reject
            </Button>
          </div>
        ) : (
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              link.status === IncidentLinkStatus.CONFIRMED
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400',
            )}
          >
            {link.status}
          </span>
        )}
      </div>
    </motion.li>
  );
}
