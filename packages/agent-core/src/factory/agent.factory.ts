import { AgentRole } from '../enums/agent-role.enum';

/**
 * Lightweight factory contract used by the backend `AgentsModule` to wire
 * concrete agent classes by `AgentRole`. The actual factory implementation
 * lives in the backend so it can inject NestJS providers; this package only
 * defines the contract that backend factories must respect.
 */
export interface IAgentFactory<TAgent = unknown> {
  create(role: AgentRole): TAgent;
}
