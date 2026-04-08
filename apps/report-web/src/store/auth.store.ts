import { UserDto } from '@sre/shared-types';
import { create } from 'zustand';

/**
 * In-memory auth store. Access token lives only in memory (refresh token
 * lives in localStorage for the hackathon — production would use httpOnly
 * cookies set by the backend).
 */
interface AuthState {
  accessToken: string | null;
  user: UserDto | null;
  setAuth: (accessToken: string, user: UserDto) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  clear: () => set({ accessToken: null, user: null }),
}));
