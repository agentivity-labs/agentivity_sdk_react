import type { AssistantChunk, AssistantHealth, AssistantResult } from './assistant-models.js';

/** Generic assistant provider — implement this against any backend. Port of `IAssistantProvider`. */
export interface IAssistantProvider {
  /** Sends a message and gets a complete response. */
  send(args: { message: string; history?: { role: string; content: string }[]; context?: Record<string, unknown> }): Promise<AssistantResult>;

  /** Sends a message and streams the response chunk by chunk. Returns an unsubscribe function. */
  stream(args: { message: string; history?: { role: string; content: string }[]; context?: Record<string, unknown> }, listener: (chunk: AssistantChunk) => void): () => void;

  checkHealth(): Promise<AssistantHealth>;
}
