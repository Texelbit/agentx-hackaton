import { NotificationEvent } from '../../common/enums';

/**
 * Snapshot of the data observers receive for a single notification dispatch.
 * Built once by `NotificationsService` so each observer renders from the
 * same source of truth.
 */
export interface NotificationPayload {
  event: NotificationEvent;
  incident: {
    id: string;
    title: string;
    description: string;
    status: string;
    priorityName: string;
    service: string;
    reporterEmail: string;
    jiraTicketKey: string | null;
    jiraTicketUrl: string | null;
    githubBranch: string | null;
    githubPrUrl: string | null;
    mergeCommitSha: string | null;
    triageSummary: string | null;
    resolutionNotes: string | null;
  };
  recipient: {
    id: string;
    email: string;
    fullName: string;
  };
  /** Free-form metadata (e.g. PR merger identity for resolution emails). */
  metadata?: Record<string, unknown>;
}

/**
 * Strategy contract for any notification channel. Adding a new channel
 * (Discord, MS Teams, ...) only requires a new observer that satisfies this
 * interface and is registered in `NotificationsModule`.
 */
export interface NotificationObserver {
  readonly channel: string;
  send(payload: NotificationPayload): Promise<void>;
}
