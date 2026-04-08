/**
 * Generic, strongly-typed tool contract that any agent can call.
 *
 * Tools are registered in a `ToolRegistry` and looked up by their unique
 * `name`. The registry validates input via the strategy's `validate` hook
 * before calling `execute`, so individual tool implementations can assume
 * inputs are well-formed.
 */
export interface Tool<TInput = unknown, TOutput = unknown> {
  /** Unique kebab-case identifier — used by agents to invoke the tool. */
  readonly name: string;

  /** Short human-readable description, surfaced to the LLM in tool-use prompts. */
  readonly description: string;

  /** Throws on invalid input; returns void on success. */
  validate(input: unknown): asserts input is TInput;

  /** Performs the actual side-effect / computation. */
  execute(input: TInput): Promise<TOutput>;
}
