/**
 * Role of a message inside a multi-turn conversation.
 * Backed by an enum to avoid magic strings across the codebase.
 */
export enum LlmMessageRole {
  SYSTEM = 'SYSTEM',
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
}

export interface LlmAttachment {
  /** MIME type, e.g. `image/png`. */
  mimeType: string;
  /** Base64-encoded payload (no data URI prefix). */
  data: string;
}

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
  attachments?: LlmAttachment[];
}
