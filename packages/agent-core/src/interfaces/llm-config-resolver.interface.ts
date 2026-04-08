import { LlmProvider } from '@sre/llm-client';
import { AgentRole } from '../enums/agent-role.enum';

/**
 * Resolved LLM configuration for an agent role.
 *
 * The actual implementation lives in the backend (`LlmConfigService`) and
 * reads from the `llm_configs` Prisma table. The agent-core package only
 * depends on this interface to stay free of any backend specifics.
 */
export interface ResolvedLlmConfig {
  provider: LlmProvider;
  model: string;
}

export interface ILlmConfigResolver {
  resolve(role: AgentRole): Promise<ResolvedLlmConfig>;
}
