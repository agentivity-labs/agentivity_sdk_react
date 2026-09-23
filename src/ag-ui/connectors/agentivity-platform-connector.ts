import { AgUiSseChannel } from '../../protocol/sse-channel.js';
import { parseAgUiEvent, type AgUiEvent } from '../../protocol/events.js';

// ── Run handle ────────────────────────────────────────────────────────────────

/** Returned by {@link AgentivityPlatformConnector.startRun}. */
export interface AgUiRunHandle {
  /** Internal run identifier. */
  runId: string;
  /** Execution identifier — correlates all runs within the same execution chain. */
  executionId: string;
  /** SSE event stream URL for this run. */
  streamUrl: string;
  entityId: string;
  /** `"agent"` | `"team"` | `"workflow"` */
  entityKind: string;
  state: string;
  createdAt?: Date;
}

function parseRunHandle(json: Record<string, unknown>): AgUiRunHandle {
  return {
    runId: String(json['runId'] ?? '').trim(),
    executionId: String(json['executionId'] ?? '').trim(),
    streamUrl: String(json['streamUrl'] ?? '').trim(),
    entityId: String(json['entityId'] ?? '').trim(),
    entityKind: String(json['entityKind'] ?? '').trim().toLowerCase(),
    state: String(json['state'] ?? '').trim().toLowerCase(),
    createdAt: typeof json['createdAt'] === 'string' ? new Date(json['createdAt']) : undefined,
  };
}

// ── Options ───────────────────────────────────────────────────────────────────

/** Options forwarded to {@link AgentivityPlatformConnector.startRun}. */
export interface AgUiStartRunOptions {
  /** Whether to enable Human-in-the-Loop gates for this run. */
  enableHil?: boolean;
  /** Optional execution identifier to attach the run to an existing chain. */
  executionId?: string;
  /** Cap on the number of agent iterations (backend-enforced). */
  maxAgentIterations?: number;
}

/** Options for {@link AgentivityPlatformConnector.sendMessage}. */
export interface AgUiSendMessageOptions {
  /** Thread to post the message into. Uses the default thread when omitted. */
  threadId?: string;
  /** Optional HIL interaction request ID when responding to a specific gate. */
  interactionRequestId?: string;
}

// ── Thread models ─────────────────────────────────────────────────────────────

/** A chat thread on a run, returned by {@link AgentivityPlatformConnector.listThreads}. */
export interface AgUiRunThread {
  threadId: string;
  title: string;
  isDefault: boolean;
  status: string;
  createdAt: string;
}

function parseRunThread(json: Record<string, unknown>): AgUiRunThread {
  return { threadId: String(json['threadId'] ?? '').trim(), title: String(json['title'] ?? '').trim(), isDefault: json['isDefault'] === true, status: String(json['status'] ?? '').trim(), createdAt: String(json['createdAt'] ?? '').trim() };
}

/** A message in a run thread, returned by {@link AgentivityPlatformConnector.listMessages}. */
export interface AgUiThreadMessage {
  messageId: string;
  threadId: string;
  /** `"assistant"` | `"user"` | `"system"` | `"tool"` */
  authorType: string;
  authorName?: string;
  text: string;
  createdAt: string;
}

function parseThreadMessage(json: Record<string, unknown>): AgUiThreadMessage {
  return {
    messageId: String(json['messageId'] ?? '').trim(),
    threadId: String(json['threadId'] ?? '').trim(),
    authorType: String(json['authorType'] ?? '').trim(),
    authorName: typeof json['authorName'] === 'string' ? json['authorName'] : undefined,
    text: String(json['text'] ?? '').trim(),
    createdAt: String(json['createdAt'] ?? '').trim(),
  };
}

// ── Connector ─────────────────────────────────────────────────────────────────

/**
 * REST + SSE connector for the Agentivity platform backend (EPIC-0449 contract)
 * — port of `AgentivityPlatformConnector`.
 *
 * Implements the unified `/api/v1/runs` API: starting runs, listening to live
 * AG-UI events over SSE, resuming HIL interrupts, and sending chat messages.
 * Bearer-token auth (distinct from {@link AgentivityClient}'s session-based
 * client — this is a standalone alternative for consumers authenticating with
 * an API key).
 *
 * ## Quick start
 * ```ts
 * const connector = new AgentivityPlatformConnector({ baseUrl: 'https://api.agentivity.com', authToken: 'ag_live_...' });
 * const handle = await connector.startRun('my-workflow-id', 'Analyse this document', { enableHil: true });
 * const unsubscribe = connector.openRunStream(handle.runId, { streamUrl: handle.streamUrl }, (event) => {
 *   if (event.type === 'TEXT_MESSAGE_CONTENT') console.log(event.delta);
 * });
 * ```
 *
 * ## HIL resume
 * ```ts
 * // Stream emits RUN_FINISHED with outcome.kind === 'interrupt' — collect user reply:
 * await connector.resumeRun(handle.runId, { interruptId: interrupt.id, responseText: userReply });
 * // The same SSE channel re-emits RUN_STARTED and continues.
 * ```
 */
export class AgentivityPlatformConnector {
  /** Root URL of the Agentivity backend (no trailing slash). */
  readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;

  constructor(args: { baseUrl: string; authToken: string; fetchImpl?: typeof fetch }) {
    this.baseUrl = args.baseUrl;
    this.authHeader = args.authToken.startsWith('Bearer ') ? args.authToken : `Bearer ${args.authToken}`;
    this.fetchImpl = args.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private get runsBase(): string {
    return `${this.baseUrl}/api/v1/runs`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(path, {
      method,
      headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`AgentivityPlatformConnector: ${method} ${path} failed with status ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('application/json') ? ((await response.json()) as T) : (undefined as T);
  }

  // ── Run start ────────────────────────────────────────────────────────────

  /**
   * Starts a run for `entityId` (agent, team, or workflow) and returns an
   * {@link AgUiRunHandle}. Pass `handle.streamUrl` to {@link openRunStream}
   * for the best performance (avoids re-computing the URL).
   */
  async startRun(entityId: string, input: string, options?: AgUiStartRunOptions): Promise<AgUiRunHandle> {
    const body: Record<string, unknown> = { entityId, input, enableHil: options?.enableHil ?? false };
    if (options?.executionId?.trim()) body['executionId'] = options.executionId.trim();
    if (options?.maxAgentIterations != null) body['maxAgentIterations'] = options.maxAgentIterations;
    const data = await this.request<Record<string, unknown>>('POST', this.runsBase, body);
    return parseRunHandle(data ?? {});
  }

  // ── SSE stream ───────────────────────────────────────────────────────────

  /**
   * Opens the AG-UI event stream for `runId` and subscribes `listener`.
   * Returns an unsubscribe function. The stream stays alive through HIL
   * interrupts (the backend keeps the SSE connection open) and only
   * terminates when `RUN_FINISHED` arrives with a non-interrupt outcome, or
   * `RUN_ERROR` arrives.
   *
   * Pass `streamUrl` from {@link AgUiRunHandle} to use the exact URL returned
   * by the backend; otherwise the connector computes
   * `${baseUrl}/api/v1/streams/runs/{runId}/events`.
   */
  openRunStream(runId: string, options: { streamUrl?: string } | undefined, listener: (event: AgUiEvent) => void): () => void {
    const url = options?.streamUrl || `${this.baseUrl}/api/v1/streams/runs/${runId}/events`;

    const channel = new AgUiSseChannel<AgUiEvent>({
      opener: async (path, { lastEventId, signal }) => {
        const headers: Record<string, string> = { Accept: 'text/event-stream', Authorization: this.authHeader, 'Cache-Control': 'no-cache' };
        if (lastEventId) headers['Last-Event-ID'] = lastEventId;
        return this.fetchImpl(path, { headers, signal });
      },
      path: url,
      parser: parseAgUiEvent2,
    });

    const unsubscribe = channel.subscribe((event) => {
      listener(event);
      // Only close the stream for terminal non-interrupt outcomes.
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

  // ── HIL resume ───────────────────────────────────────────────────────────

  /**
   * Resumes `runId` after a HIL interrupt by submitting `responseText` for
   * `interruptId`. After a successful POST the backend emits `RUN_STARTED` on
   * the open SSE channel and the run continues.
   */
  async resumeRun(runId: string, options: { interruptId: string; responseText: string }): Promise<void> {
    await this.request('POST', `${this.runsBase}/${runId}/resume`, { interruptId: options.interruptId, response: { text: options.responseText } });
  }

  // ── Free-chat message ────────────────────────────────────────────────────

  /**
   * Sends a free-text `message` into an ongoing run. Use `options` to target
   * a specific thread or attach an interaction request ID when responding to
   * a specific HIL gate.
   */
  async sendMessage(runId: string, message: string, options?: AgUiSendMessageOptions): Promise<void> {
    const body: Record<string, unknown> = { message };
    if (options?.threadId?.trim()) body['threadId'] = options.threadId.trim();
    if (options?.interactionRequestId?.trim()) body['interactionRequestId'] = options.interactionRequestId.trim();
    await this.request('POST', `${this.runsBase}/${runId}/interactions`, body);
  }

  // ── Thread management ────────────────────────────────────────────────────

  /** Lists the chat threads for `runId`. */
  async listThreads(runId: string): Promise<AgUiRunThread[]> {
    const data = await this.request<unknown>('GET', `${this.runsBase}/${runId}/threads`);
    return Array.isArray(data) ? data.filter((d): d is Record<string, unknown> => !!d && typeof d === 'object').map(parseRunThread) : [];
  }

  /** Lists messages in `threadId` for `runId`. */
  async listMessages(runId: string, threadId: string): Promise<AgUiThreadMessage[]> {
    const data = await this.request<unknown>('GET', `${this.runsBase}/${runId}/threads/${threadId}/messages`);
    return Array.isArray(data) ? data.filter((d): d is Record<string, unknown> => !!d && typeof d === 'object').map(parseThreadMessage) : [];
  }
}

function parseAgUiEvent2(_event: string, _id: string | undefined, data: string | undefined): AgUiEvent | undefined {
  if (!data) return undefined;
  try {
    const json: unknown = JSON.parse(data);
    if (json && typeof json === 'object' && !Array.isArray(json)) return parseAgUiEvent(json as Record<string, unknown>);
  } catch {
    // Malformed frame — silently discard.
  }
  return undefined;
}
