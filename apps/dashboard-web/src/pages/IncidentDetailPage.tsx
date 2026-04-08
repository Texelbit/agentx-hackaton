import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IncidentDto,
  IncidentLinkStatus,
  IncidentStatus,
  SimilarIncidentDto,
} from '@sre/shared-types';
import { Link, useParams } from 'react-router-dom';
import { PriorityBadge, StatusBadge } from '../components/Badge';
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

  if (!incident) return <div className="p-8 text-slate-500">Loading…</div>;

  return (
    <div className="p-8">
      <Link to="/incidents" className="text-sm text-indigo-600 hover:underline">
        ← Back to incidents
      </Link>

      <div className="mt-3 mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{incident.title}</h1>
          <div className="mt-1 text-sm text-slate-500">
            {incident.service} · reported by {incident.reporterEmail} ·{' '}
            {new Date(incident.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge name={incident.priorityName} />
          <StatusBadge status={incident.status} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Description</h2>
            <p className="whitespace-pre-wrap text-slate-800">{incident.description}</p>
          </section>

          {incident.triageSummary && (
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">
                SRE Agent triage
              </h2>
              <pre className="whitespace-pre-wrap text-sm text-slate-800">
                {incident.triageSummary}
              </pre>
            </section>
          )}

          {similar && similar.length > 0 && (
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-slate-500">
                <span>🔍 Similar past incidents</span>
                <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {similar.length}
                </span>
              </h2>
              <p className="mb-3 text-xs text-slate-500">
                These were detected via embedding similarity. Confirm or reject
                each one to keep the knowledge base accurate.
              </p>
              <ul className="space-y-2">
                {similar.map((l) => (
                  <li
                    key={l.linkId}
                    className="rounded-lg border border-slate-100 p-3 hover:border-indigo-200 hover:bg-indigo-50/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/incidents/${l.peerId}`}
                            className="truncate text-sm font-medium text-indigo-600 hover:underline"
                          >
                            {l.peerTitle}
                          </Link>
                          <span className="shrink-0 rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                            {(l.similarity * 100).toFixed(0)}% match
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <PriorityBadge name={l.peerPriorityName} />
                          <StatusBadge status={l.peerStatus} />
                          {l.peerJiraUrl && (
                            <a
                              href={l.peerJiraUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:underline"
                            >
                              🎫 {l.peerJiraKey}
                            </a>
                          )}
                          <span className="text-slate-400">
                            {new Date(l.peerCreatedAt).toLocaleDateString()}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                            style={{
                              backgroundColor:
                                l.status === IncidentLinkStatus.CONFIRMED
                                  ? '#d1fae5'
                                  : l.status === IncidentLinkStatus.REJECTED
                                    ? '#fee2e2'
                                    : '#fef3c7',
                              color:
                                l.status === IncidentLinkStatus.CONFIRMED
                                  ? '#065f46'
                                  : l.status === IncidentLinkStatus.REJECTED
                                    ? '#991b1b'
                                    : '#92400e',
                            }}
                          >
                            {l.status}
                          </span>
                        </div>
                      </div>
                      {l.status === IncidentLinkStatus.SUGGESTED && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() =>
                              updateLink.mutate({
                                linkId: l.linkId,
                                status: 'CONFIRMED',
                              })
                            }
                            className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() =>
                              updateLink.mutate({
                                linkId: l.linkId,
                                status: 'REJECTED',
                              })
                            }
                            className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-300"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">Links</h3>
            <div className="space-y-2 text-sm">
              {incident.jiraTicketUrl && (
                <a
                  href={incident.jiraTicketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-indigo-600 hover:underline"
                >
                  🎫 Jira: {incident.jiraTicketKey}
                </a>
              )}
              {incident.githubBranch && (
                <div className="text-slate-700">🌿 {incident.githubBranch}</div>
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">
              Change status
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(IncidentStatus).map((s) => (
                <button
                  key={s}
                  onClick={() => updateStatus.mutate(s)}
                  disabled={s === incident.status || updateStatus.isPending}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-30"
                >
                  {s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
