/**
 * Structured triage produced by `SREAgent`.
 *
 * The `assignedPriorityName` MUST match a row in the `priorities` table
 * (resolved by name → id by `IncidentsService`). The other fields are
 * persisted into `incidents.triage_summary` as a single markdown blob.
 */
export interface TriageOutput {
  rootCause: string;
  affectedComponents: string[];
  investigationSteps: string[];
  filesToCheck: string[];
  recurrencePattern: string;
  assignedPriorityName: string;
}
