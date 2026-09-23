import { AgUiSseChannel } from '../../protocol/sse-channel.js';
import { parseAgUiEvent, type AgUiEvent } from '../../protocol/events.js';
import { runAgentInputToJson, type RunAgentInput } from '../../protocol/run-agent-input.js';

/**
 * Connector for [LangGraph Cloud](https://langchain-ai.github.io/langgraph/cloud/)
 * and self-hosted LangGraph deployments — port of `LangGraphConnector`.
 *
 * ## Backend requirement
 *
 * Your LangGraph graph must use the official AG-UI adapter so it emits
 * AG-UI-compatible SSE events (Python `ag-ui` package's `add_agui_route`).
 * The connector then POSTs a `RunAgentInput` body to that endpoint and
 * consumes the AG-UI SSE stream — identical to any other AG-UI backend.
 *
 * ## Quick start
 * ```ts
 * const connector = new LangGraphConnector({ deploymentUrl: 'https://my-graph.langchain.app', apiKey: 'lsv2_pt_...', assistantId: 'my-assistant' });
 * const unsubscribe = connector.run({ input: { threadId: 'thread-1', runId: 'run-1', messages: [buildAgUiMessage('user', { text: 'Plan my trip to Lisbon' })] } }, onEvent);
 * ```
 *
 * ## Thread management
 * LangGraph persists conversation history by thread. Use {@link createThread}
 * to obtain a server-side thread ID before your first run, or pass any
 * client-generated UUID as `input.threadId` — LangGraph creates the thread on
 * first use.
 */
export class LangGraphConnector {
  /** LangGraph Cloud deployment URL or your self-hosted server URL. No trailing slash. */
  readonly deploymentUrl: string;
  /** LangGraph Cloud API key (`lsv2_*`) or your own auth token. */
  readonly apiKey: string;
  /**
   * The LangGraph assistant or graph name to run. Forwarded to the backend
   * via `RunAgentInput.forwardedProps` under the key `assistant_id`.
   */
  readonly assistantId: string;
  /** Path to the AG-UI endpoint on your backend. Defaults to `'/agent'`. */
  readonly agentPath: string;
  /** LangGraph stream mode(s) forwarded to the backend as a hint. Defaults to `['events']`. */
  readonly streamMode: string[];
  private readonly fetchImpl: typeof fetch;

  constructor(args: { deploymentUrl: string; apiKey: string; assistantId: string; agentPath?: string; streamMode?: string[]; fetchImpl?: typeof fetch }) {
    this.deploymentUrl = args.deploymentUrl;
    this.apiKey = args.apiKey;
    this.assistantId = args.assistantId;
    this.agentPath = args.agentPath ?? '/agent';
    this.streamMode = args.streamMode ?? ['events'];
    this.fetchImpl = args.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  // ── Thread management ────────────────────────────────────────────────────

  /**
   * Creates a new thread on the LangGraph server and returns its ID. Call
   * this before your first {@link run} if you want a server-managed thread
   * ID. Alternatively, pass any UUID as `input.threadId`.
   */
  async createThread(metadata?: Record<string, unknown>): Promise<string> {
    const response = await this.fetchImpl(`${this.deploymentUrl}/threads`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(metadata ? { metadata } : {}),
    });
    if (!response.ok) throw new Error(`LangGraphConnector.createThread failed with status ${response.status}`);
    const body: unknown = await response.json();
    const threadId = body && typeof body === 'object' ? (body as Record<string, unknown>)['thread_id'] : undefined;
    if (typeof threadId !== 'string' || threadId.length === 0) {
      throw new Error(`LangGraphConnector.createThread: server did not return a thread_id. Response: ${JSON.stringify(body)}`);
    }
    return threadId;
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  /**
   * Starts an agent run and subscribes `listener` to the resulting AG-UI
   * event stream. Returns an unsubscribe function. `assistantId` and
   * `streamMode` are forwarded via `forwardedProps` so the AG-UI adapter can
   * pass them to LangGraph's internal streaming API. `input.threadId`
   * identifies the LangGraph thread — created automatically if it doesn't exist.
   */
  run(args: { input: RunAgentInput }, listener: (event: AgUiEvent) => void): () => void {
    // Merge caller-supplied forwardedProps with LangGraph-specific hints.
    const enriched: RunAgentInput = {
      ...args.input,
      forwardedProps: { assistant_id: this.assistantId, stream_mode: this.streamMode, ...args.input.forwardedProps },
    };
    return this.runStream({ path: this.agentPath, body: runAgentInputToJson(enriched) }, listener);
  }

  /** Resumes the agent after an interrupt. Equivalent to {@link run} with `input.resume` populated. */
  resume(args: { input: RunAgentInput }, listener: (event: AgUiEvent) => void): () => void {
    if (!args.input.resume || args.input.resume.length === 0) {
      throw new Error('LangGraphConnector.resume: input.resume must contain at least one ResumePayload. Did you mean to call run() instead?');
    }
    return this.run(args, listener);
  }

  // ── Cancellation ──────────────────────────────────────────────────────────

  /**
   * Cancels an in-progress run for `threadId`. Sends
   * `POST /threads/{threadId}/runs/cancel`. `wait: true` blocks the call
   * until the run is fully cancelled.
   */
  async cancel(args: { threadId: string; wait?: boolean }): Promise<void> {
    const response = await this.fetchImpl(`${this.deploymentUrl}/threads/${args.threadId}/runs/cancel`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: args.wait ? JSON.stringify({ wait: true }) : undefined,
    });
    if (!response.ok) throw new Error(`LangGraphConnector.cancel failed with status ${response.status}`);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    return { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' };
  }

  private runStream(args: { path: string; body: Record<string, unknown> }, listener: (event: AgUiEvent) => void): () => void {
    const channel = new AgUiSseChannel<AgUiEvent>({
      opener: async (path, { lastEventId, signal }) => {
        const headers: Record<string, string> = { Accept: 'text/event-stream', ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}), ...this.authHeaders() };
        return this.fetchImpl(this.deploymentUrl + path, { method: 'POST', headers, body: JSON.stringify(args.body), signal });
      },
      path: args.path,
      parser: parseFrame,
    });

    const unsubscribe = channel.subscribe((event) => {
      listener(event);
      // A RUN_FINISHED with outcome.kind === 'interrupt' means a HIL gate opened, not that
      // the run is over — only tear down the channel on a genuine terminal outcome.
      if (event.type === 'RUN_ERROR' || (event.type === 'RUN_FINISHED' && event.outcome?.kind !== 'interrupt')) {
        channel.markTerminated();
        channel.dispose();
      }
    });
    channel.start();

    return () => {
      unsubscribe();
      channel.dispose();
    };
  }
}

function parseFrame(_event: string, _id: string | undefined, data: string | undefined): AgUiEvent | undefined {
  if (!data) return undefined;
  try {
    const json: unknown = JSON.parse(data);
    if (json && typeof json === 'object' && !Array.isArray(json)) return parseAgUiEvent(json as Record<string, unknown>);
  } catch {
    // Malformed frame — silently discard.
  }
  return undefined;
}
