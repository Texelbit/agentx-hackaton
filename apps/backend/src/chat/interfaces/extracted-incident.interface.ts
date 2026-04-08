/**
 * Structured payload that the IntakeAgent extracts from a finalized chat
 * conversation. The IncidentsService consumes this to bootstrap the actual
 * incident record + Jira ticket + GitHub branch.
 *
 * Lives in the `chat/` module because the agent that produces it lives here.
 */
export interface ExtractedIncident {
  title: string;
  description: string;
  service: string;
  /** Optional priority hint — the SREAgent will reconfirm during triage. */
  suggestedPriorityName?: string;
  /** Steps to reproduce, in user words. */
  reproductionSteps?: string;
  /** Any error message / stack trace pasted by the user. */
  errorOutput?: string;
}
