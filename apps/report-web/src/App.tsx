import { Navigate, Route, Routes } from 'react-router-dom';
import { ChatPage } from './pages/ChatPage';
import { LoginPage } from './pages/LoginPage';
import { useAuthStore } from './store/auth.store';

export function App() {
  const user = useAuthStore((s) => s.user);

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/chat" replace /> : <LoginPage />} />
      <Route path="/chat" element={user ? <ChatPage /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? '/chat' : '/login'} replace />} />
    </Routes>
  );
}
