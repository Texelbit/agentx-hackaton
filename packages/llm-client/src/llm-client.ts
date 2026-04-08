import { LlmProvider } from './enums/llm-provider.enum';
import { LlmStrategy } from './interfaces/llm-strategy.interface';

/**
 * Registry that owns one strategy instance per provider.
 *
 * Consumers (agents, services) ask the client for a strategy by `LlmProvider`
 * — the actual provider/model picked for a given agent role is resolved
 * upstream from the `llm_configs` DB table by `LlmConfigService`.
 */
export class LlmClient {
  private readonly strategies = new Map<LlmProvider, LlmStrategy>();

  register(provider: LlmProvider, strategy: LlmStrategy): this {
    this.strategies.set(provider, strategy);
    return this;
  }

  forProvider(provider: LlmProvider): LlmStrategy {
    const strategy = this.strategies.get(provider);
    if (!strategy) {
      throw new Error(
        `No LLM strategy registered for provider "${provider}". ` +
          `Register one via LlmClient.register() during module initialization.`,
      );
    }
    return strategy;
  }

  hasProvider(provider: LlmProvider): boolean {
    return this.strategies.has(provider);
  }
}
