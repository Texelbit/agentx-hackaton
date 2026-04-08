import { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { logout } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

const navLink = (isActive: boolean): string =>
  `block rounded-lg px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`;

export function Layout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin)();
  const navigate = useNavigate();

  function handleLogout(): void {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col bg-slate-900 p-4">
        <div className="mb-6">
          <Link to="/" className="text-lg font-semibold text-white">
            SRE Agent
          </Link>
          <p className="text-xs text-slate-400">Dashboard</p>
        </div>

        <nav className="flex-1 space-y-1">
          <NavLink to="/" end className={({ isActive }) => navLink(isActive)}>
            🏠 Dashboard
          </NavLink>
          <NavLink to="/incidents" className={({ isActive }) => navLink(isActive)}>
            🐛 Incidents
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => navLink(isActive)}>
              ⚙️ Admin
            </NavLink>
          )}
        </nav>

        <div className="mt-4 border-t border-slate-800 pt-4">
          <div className="text-xs text-slate-400">Signed in as</div>
          <div className="truncate text-sm text-white">{user?.email}</div>
          <div className="mb-2 text-xs text-indigo-400">{user?.role}</div>
          <button
            onClick={handleLogout}
            className="w-full rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-100">{children}</main>
    </div>
  );
}
