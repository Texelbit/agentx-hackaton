import { TokenPair, UserDto } from '@sre/shared-types';
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const REFRESH_KEY = 'sre.refreshToken';

/**
 * Axios instance with two interceptors:
 *  1. Request: attach `Authorization: Bearer <accessToken>` from the store
 *  2. Response: on 401, transparently call `/auth/refresh` once, persist
 *     the new pair, retry the failed request
 */
export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const newAccess = await ensureFreshToken();
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch (e) {
        useAuthStore.getState().clear();
        localStorage.removeItem(REFRESH_KEY);
        throw e;
      }
    }
    throw error;
  },
);

async function ensureFreshToken(): Promise<string> {
  if (refreshing) return refreshing;
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) throw new Error('No refresh token');

  refreshing = axios
    .post<TokenPair>(`${BASE_URL}/auth/refresh`, { refreshToken })
    .then(async (res) => {
      localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
      // Refresh user profile so role/permissions stay accurate
      const me = await axios.get<UserDto>(`${BASE_URL}/users/me/notification-preferences`, {
        headers: { Authorization: `Bearer ${res.data.accessToken}` },
      }).catch(() => null);
      const user = useAuthStore.getState().user;
      useAuthStore.getState().setAuth(res.data.accessToken, user!);
      void me;
      return res.data.accessToken;
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

// ── Typed endpoints ──────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<{ user: UserDto; tokens: TokenPair }> {
  const tokens = (await axios.post<TokenPair>(`${BASE_URL}/auth/login`, { email, password })).data;
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  // We don't have /users/me yet — decode the JWT for the user info
  const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
  const user: UserDto = {
    id: payload.sub,
    email: payload.email,
    fullName: payload.email,
    role: payload.role,
    permissions: payload.permissions ?? [],
    isActive: true,
    isProtected: payload.isProtected ?? false,
    createdAt: '',
    updatedAt: '',
  };
  return { user, tokens };
}

export function logout(): void {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (refreshToken) {
    api.post('/auth/logout', { refreshToken }).catch(() => undefined);
  }
  localStorage.removeItem(REFRESH_KEY);
  useAuthStore.getState().clear();
}
