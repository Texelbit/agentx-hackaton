import { useQuery } from '@tanstack/react-query';
import { IncidentDto, IncidentStatus } from '@sre/shared-types';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PriorityBadge, StatusBadge } from '../components/Badge';
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

  const incidents = (data ?? []).filter((i) => filter === 'ALL' || i.status === filter);

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Incidents</h1>
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-3 py-1 text-sm ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Loading…</div>
        ) : incidents.length === 0 ? (
          <div className="py-12 text-center text-slate-500">No incidents.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Jira</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {incidents.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/incidents/${i.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {i.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{i.service}</td>
                  <td className="px-4 py-3">
                    <PriorityBadge name={i.priorityName} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={i.status} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {i.jiraTicketUrl ? (
                      <a
                        href={i.jiraTicketUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline"
                      >
                        {i.jiraTicketKey}
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(i.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
