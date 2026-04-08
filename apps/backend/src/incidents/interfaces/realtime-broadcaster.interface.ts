/**
 * IoC bridge from `IncidentsService` to the realtime gateway. Block 10
 * provides an implementation under this token; until then broadcasts are
 * silently skipped.
 */
export const REALTIME_BROADCASTER = 'REALTIME_BROADCASTER';

export type RealtimeEvent =
  | 'incident.created'
  | 'incident.updated'
  | 'incident.status_changed'
  | 'incident.link_suggested'
  | 'triage.progress';

export interface IRealtimeBroadcaster {
  emit(event: RealtimeEvent, payload: Record<string, unknown>): void;
}
