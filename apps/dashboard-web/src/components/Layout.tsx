import { motion } from 'framer-motion';
import {
  Activity,
  Bug,
  LogOut,
  Settings2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { logout } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { cn } from './ui/cn';
import { GradientMesh } from './ui/GradientMesh';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: Activity, end: true },
  { to: '/incidents', label: 'Incidents', icon: Bug },
];

export function Layout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin)();
  const navigate = useNavigate();

  function handleLogout(): void {
    logout();
    navigate('/login');
  }

  const navItems: NavItem[] = isAdmin
    ? [...NAV_ITEMS, { to: '/admin', label: 'Admin', icon: Settings2 }]
    : NAV_ITEMS;

  return (
    <div className="flex h-full bg-zinc-950">
      {/* Subtle gradient mesh background */}
      <GradientMesh />

      {/* Sidebar */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative z-10 flex w-64 flex-col border-r border-zinc-800/60 bg-zinc-950/60 backdrop-blur-xl"
      >
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-white">
              SRE Agent
            </div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              Incident Response
            </div>
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-zinc-800/60 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-100',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg bg-zinc-800/60"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <item.icon className="relative h-4 w-4" />
                  <span className="relative">{item.label}</span>
                  {isActive && (
                    <span className="relative ml-auto h-1.5 w-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-zinc-800/60 p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/20 to-brand-700/20 text-xs font-semibold text-brand-400 ring-1 ring-brand-500/30">
              {user?.email?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-zinc-200">
                {user?.email}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-brand-400">
                {user?.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main content */}
      <main className="relative z-10 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
