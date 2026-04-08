import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user, tokens } = await login(email, password);
      setAuth(tokens.accessToken, user);
      navigate('/');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-900 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-2xl"
      >
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">SRE Agent Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">For ADMIN and ENGINEER roles only.</p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </label>

        {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
