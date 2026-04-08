import { ExtractedIncident } from './extracted-incident.interface';

/**
 * Inversion-of-control bridge between the Chat module and the Incidents
 * module. The Incidents module (Block 7) provides a class implementing this
 * interface under the `INCIDENT_FROM_CHAT_CREATOR` token, which the
 * `ChatController` consumes via `@Optional() @Inject(...)`.
 *
 * This avoids a hard module-level dependency from chat → incidents and lets
 * us build/ship the chat module standalone in earlier blocks.
 */
export const INCIDENT_FROM_CHAT_CREATOR = 'INCIDENT_FROM_CHAT_CREATOR';

export interface IIncidentFromChatCreator {
  createFromChat(args: {
    chatSessionId: string;
    reporterId: string;
    reporterEmail: string;
    extracted: ExtractedIncident;
  }): Promise<{ id: string }>;
}
