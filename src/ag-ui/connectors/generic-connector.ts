import { AgUiSseChannel } from '../../protocol/sse-channel.js';
import { parseAgUiEvent, type AgUiEvent } from '../../protocol/events.js';
import { runAgentInputToJson, type RunAgentInput } from '../../protocol/run-agent-input.js';

/**
 * A connector for any backend that natively speaks the AG-UI protocol over
 * SSE — port of `AgUiGenericConnector`.
 *
 * Use this when your backend already emits AG-UI events (e.g. via the
 * official [ag-ui Python adapter](https://github.com/ag-ui-protocol/ag-ui),
 * the LangGraph ag-ui bridge, or any other AG-UI-compliant endpoint).
 *
 * The connector POSTs a `RunAgentInput` body to `baseUrl` + `path`, then
 * consumes the SSE response as a stream of AG-UI events. The underlying
 * {@link AgUiSseChannel} handles reconnection with exponential backoff and a
 * watchdog timer; the stream ends cleanly when `RUN_FINISHED` or `RUN_ERROR`
 * is received.
 *
 * ## Basic usage
 * ```ts
 * const connector = new AgUiGenericConnector({ baseUrl: 'https://my-backend.example.com', headers: { Authorization: `Bearer ${token}` } });
 * const unsubscribe = connector.run({
 *   path: '/api/agent',
 *   input: { threadId: 'thread-1', runId: 'run-1', messages: [buildAgUiMessage('user', { text: 'Find me a great espresso machine' })] },
 * }, (event) => generativeController.feedEvent(event));
 * ```
 *
 * ## Feeding multiple controllers
 * ```ts
 * const unsubscribe = connector.run({ path: '/api/agent', input }, (event) => {
 *   lifecycle.feedEvent(event);
 *   activity.feedEvent(event);
 *   state.feedEvent(event);
 *   generative.feedEvent(event);
 * });
 * ```
 */
export class AgUiGenericConnector {
  /** Root URL of your AG-UI-compatible backend (no trailing slash). */
  readonly baseUrl: string;
  /**
   * HTTP headers added to every request. Common use:
   * `{ Authorization: 'Bearer ...' }`. `Accept: text/event-stream` and
   * `Content-Type: application/json` are set automatically.
   */
  readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(args: { baseUrl: string; headers?: Record<string, string>; fetchImpl?: typeof fetch }) {
    this.baseUrl = args.baseUrl;
    this.headers = args.headers ?? {};
    this.fetchImpl = args.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Starts an agent run at `baseUrl` + `path` and subscribes `listener` to
   * the resulting AG-UI event stream. Returns an unsubscribe function. The
   * stream terminates automatically when `RUN_FINISHED` or `RUN_ERROR`
   * arrives; reconnection is handled internally.
   *
   * `input` is serialized as the POST body — omit for an empty object
   * (useful for stateless single-shot agents).
   */
  run(args: { path: string; input?: RunAgentInput }, listener: (event: AgUiEvent) => void): () => void {
    const body = args.input ? runAgentInputToJson(args.input) : {};

    const channel = new AgUiSseChannel<AgUiEvent>({
      opener: async (path, { lastEventId, signal }) => {
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
          ...this.headers,
        };
        return this.fetchImpl(this.baseUrl + path, { method: 'POST', headers, body: JSON.stringify(body), signal });
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
