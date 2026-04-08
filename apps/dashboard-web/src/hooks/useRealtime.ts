import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { connectRealtime, disconnectRealtime } from '../lib/realtime';
import { useAuthStore } from '../store/auth.store';

/**
 * Connects to the realtime gateway after login and routes incoming events
 * into the React Query cache so the dashboard updates without manual
 * refetches.
 */
export function useRealtime(): void {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;
    const socket = connectRealtime(accessToken);

    const invalidateIncidents = () => {
      void queryClient.invalidateQueries({ queryKey: ['incidents'] });
    };

    socket.on('incident.created', invalidateIncidents);
    socket.on('incident.updated', invalidateIncidents);
    socket.on('incident.status_changed', invalidateIncidents);
    socket.on('incident.link_suggested', invalidateIncidents);

    return () => {
      socket.off('incident.created', invalidateIncidents);
      socket.off('incident.updated', invalidateIncidents);
      socket.off('incident.status_changed', invalidateIncidents);
      socket.off('incident.link_suggested', invalidateIncidents);
      disconnectRealtime();
    };
  }, [accessToken, queryClient]);
}
