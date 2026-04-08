import { useQuery } from '@tanstack/react-query';
import { IncidentDto, IncidentStatus } from '@sre/shared-types';
import { Link } from 'react-router-dom';
import { PriorityBadge, StatusBadge } from '../components/Badge';
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
  const open = incidents.filter((i) => i.status !== IncidentStatus.DONE && i.status !== IncidentStatus.CANCELLED);
  const inReview = incidents.filter((i) => i.status === IncidentStatus.IN_REVIEW);
  const resolved = incidents.filter((i) => i.status === IncidentStatus.DONE);
  const recent = incidents.slice(0, 8);

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Overview</h1>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Kpi label="Open incidents" value={open.length} color="bg-blue-50 text-blue-700" />
        <Kpi label="In review" value={inReview.length} color="bg-purple-50 text-purple-700" />
        <Kpi label="Resolved" value={resolved.length} color="bg-emerald-50 text-emerald-700" />
      </div>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent incidents</h2>
          <Link to="/incidents" className="text-sm text-indigo-600 hover:underline">
            View all →
          </Link>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-slate-500">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="py-8 text-center text-slate-500">No incidents yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((i) => (
              <li key={i.id} className="py-3">
                <Link to={`/incidents/${i.id}`} className="block hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-900">{i.title}</div>
                      <div className="text-xs text-slate-500">
                        {i.service} · {new Date(i.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <PriorityBadge name={i.priorityName} />
                      <StatusBadge status={i.status} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-2xl p-6 ${color}`}>
      <div className="text-sm font-medium opacity-80">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}
