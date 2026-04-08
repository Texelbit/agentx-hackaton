import { TokenPair, UserDto } from '@sre/shared-types';
import axios, { AxiosInstance } from 'axios';
import { useAuthStore } from '../store/auth.store';

export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const REFRESH_KEY = 'sre.dashboard.refreshToken';

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
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
        const newAccess = await ensureFresh();
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

async function ensureFresh(): Promise<string> {
  if (refreshing) return refreshing;
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) throw new Error('No refresh token');

  refreshing = axios
    .post<TokenPair>(`${BASE_URL}/auth/refresh`, { refreshToken })
    .then((res) => {
      localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
      const user = useAuthStore.getState().user;
      if (user) useAuthStore.getState().setAuth(res.data.accessToken, user);
      return res.data.accessToken;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: UserDto; tokens: TokenPair }> {
  const tokens = (await axios.post<TokenPair>(`${BASE_URL}/auth/login`, { email, password })).data;
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
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
  if (refreshToken) api.post('/auth/logout', { refreshToken }).catch(() => undefined);
  localStorage.removeItem(REFRESH_KEY);
  useAuthStore.getState().clear();
}
