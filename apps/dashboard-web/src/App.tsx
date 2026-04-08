import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useRealtime } from './hooks/useRealtime';
import { AdminPage } from './pages/AdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { LoginPage } from './pages/LoginPage';
import { useAuthStore } from './store/auth.store';

export function App() {
  const user = useAuthStore((s) => s.user);
  useRealtime();

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route path="/incidents/:id" element={<IncidentDetailPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
