/**
 * Canonical list of LLM providers supported by the platform.
 * Mirrors the `LlmProvider` Prisma enum exactly.
 */
export enum LlmProvider {
  GEMINI = 'GEMINI',
  ANTHROPIC = 'ANTHROPIC',
  OPENAI = 'OPENAI',
}
