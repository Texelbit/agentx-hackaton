import { io, Socket } from 'socket.io-client';
import { BASE_URL } from './api';

/**
 * Singleton Socket.IO client connected to the backend `/realtime` namespace.
 * Pass the JWT access token via `auth.token` for the gateway's handshake
 * verification (see `RealtimeGateway.handleConnection`).
 */
let socket: Socket | null = null;

export function connectRealtime(accessToken: string): Socket {
  if (socket?.connected) return socket;
  socket?.disconnect();

  socket = io(`${BASE_URL}/realtime`, {
    auth: { token: accessToken },
    transports: ['websocket'],
    autoConnect: true,
  });

  return socket;
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
