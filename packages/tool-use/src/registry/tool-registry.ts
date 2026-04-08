import { Tool } from '../interfaces/tool.interface';

export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Tool "${name}" is not registered`);
    this.name = 'ToolNotFoundError';
  }
}

/**
 * In-memory registry of tools available to the agents.
 * One instance per backend process; modules register their tools at startup.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool<unknown, unknown>>();

  register<TInput, TOutput>(tool: Tool<TInput, TOutput>): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool as Tool<unknown, unknown>);
    return this;
  }

  get<TInput, TOutput>(name: string): Tool<TInput, TOutput> {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolNotFoundError(name);
    return tool as Tool<TInput, TOutput>;
  }

  list(): Array<{ name: string; description: string }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }

  async execute<TOutput>(name: string, input: unknown): Promise<TOutput> {
    // Explicit type annotation is required because `tool.validate` is an
    // `asserts` function — TS demands the call target be declared statically.
    const tool: Tool<unknown, TOutput> = this.get<unknown, TOutput>(name);
    tool.validate(input);
    return tool.execute(input);
  }
}
