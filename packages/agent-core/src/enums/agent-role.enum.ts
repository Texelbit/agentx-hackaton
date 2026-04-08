/**
 * Functional roles an agent can play in the SRE pipeline.
 * Each role maps to a row in the `llm_configs` table that decides which
 * provider/model the agent uses at runtime.
 */
export enum AgentRole {
  INTAKE_AGENT = 'INTAKE_AGENT',
  TRIAGE_AGENT = 'TRIAGE_AGENT',
  EMAIL_COMPOSER = 'EMAIL_COMPOSER',
  EMBEDDINGS = 'EMBEDDINGS',
}
