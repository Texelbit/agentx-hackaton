import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IncidentDto,
  IncidentLinkDto,
  IncidentLinkStatus,
  IncidentStatus,
} from '@sre/shared-types';
import { Link, useParams } from 'react-router-dom';
import { PriorityBadge, StatusBadge } from '../components/Badge';
import { api } from '../lib/api';

function fetchIncident(id: string): Promise<IncidentDto> {
  return api.get<IncidentDto>(`/incidents/${id}`).then((r) => r.data);
}

function fetchSimilar(id: string): Promise<IncidentLinkDto[]> {
  return api.get<IncidentLinkDto[]>(`/incidents/${id}/similar`).then((r) => r.data);
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
              <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">
                Similar incidents
              </h2>
              <ul className="space-y-2">
                {similar.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
                  >
                    <div>
                      <Link
                        to={`/incidents/${l.toId === id ? l.fromId : l.toId}`}
                        className="text-sm text-indigo-600 hover:underline"
                      >
                        {l.toId === id ? l.fromId : l.toId}
                      </Link>
                      <div className="text-xs text-slate-500">
                        similarity {l.similarity.toFixed(2)} · {l.status}
                      </div>
                    </div>
                    {l.status === IncidentLinkStatus.SUGGESTED && (
                      <div className="flex gap-1">
                        <button
                          onClick={() =>
                            updateLink.mutate({ linkId: l.id, status: 'CONFIRMED' })
                          }
                          className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() =>
                            updateLink.mutate({ linkId: l.id, status: 'REJECTED' })
                          }
                          className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-300"
                        >
                          Reject
                        </button>
                      </div>
                    )}
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
