import { NotificationEvent } from '../../common/enums';

/**
 * IoC bridge from `IncidentsService` to the notifications module. Block 8
 * (Notifications) provides an implementation under this token; until then
 * `IncidentsService` simply skips dispatching with a debug log.
 */
export const INCIDENT_NOTIFIER = 'INCIDENT_NOTIFIER';

export interface IIncidentNotifier {
  dispatch(args: {
    incidentId: string;
    event: NotificationEvent;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}
