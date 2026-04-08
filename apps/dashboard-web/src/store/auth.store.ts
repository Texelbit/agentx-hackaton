import { Permission, Role, UserDto } from '@sre/shared-types';
import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  user: UserDto | null;
  setAuth: (accessToken: string, user: UserDto) => void;
  clear: () => void;
  hasPermission: (perm: Permission) => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  clear: () => set({ accessToken: null, user: null }),
  hasPermission: (perm) => get().user?.permissions.includes(perm) ?? false,
  isAdmin: () => {
    const role = get().user?.role;
    return role === Role.ADMIN || role === Role.SUPER_ADMIN;
  },
}));
