import { AgentivityHttpCore } from '../http-core.js';

/** Chat context run (AG-UI stream over a chat context). */
export class ChatContextApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  /** Opens a raw streaming (SSE) `Response` for a chat context run. */
  async openChatRun(args: { contextId: string; threadId: string; runId?: string; messages: Record<string, unknown>[]; signal?: AbortSignal }): Promise<Response> {
    const body: Record<string, unknown> = { threadId: args.threadId, messages: args.messages };
    if (args.runId) body['runId'] = args.runId;

    const response = await this.c.fetchImpl(this.c.resolveUrl(`/chat/contexts/${encodeURIComponent(args.contextId)}/run`), {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(body),
      signal: args.signal,
    });
    if (!response.body) {
      throw new Error(`Chat run stream returned no body for context ${args.contextId}.`);
    }
    return response;
  }
}
