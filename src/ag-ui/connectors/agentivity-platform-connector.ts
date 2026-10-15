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
  /** Conversation to write the message in. The main conversation of the execution when omitted. */
  threadId?: string;
}

// ── Thread models ─────────────────────────────────────────────────────────────

/** A conversation of an execution, returned by {@link AgentivityPlatformConnector.listThreads}. */
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

/** A message in a conversation of an execution, returned by {@link AgentivityPlatformConnector.listMessages}. */
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
 * Works at the level of an execution (`/api/v1/executions`): starting one, listening to its live AG-UI events over
 * SSE, answering the questions it asks a person, and writing in its conversation. Runs, the levels inside an
 * execution, are never needed.
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
 * ## Answering a question
 * ```ts
 * // Stream emits RUN_FINISHED with outcome.kind === 'interrupt' — collect user reply:
 * await connector.respond(handle.executionId, { requestId: interrupt.id, responseText: userReply });
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

  private get executionsBase(): string {
    return `${this.baseUrl}/api/v1/executions`;
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
   * Starts an execution of `entityId` (agent, team, or workflow) and returns an
   * {@link AgUiRunHandle} with its `executionId`. Pass `handle.streamUrl` to {@link openRunStream}
   * for the best performance (avoids re-computing the URL).
   */
  async startRun(entityId: string, input: string, options?: AgUiStartRunOptions): Promise<AgUiRunHandle> {
    const body: Record<string, unknown> = { entityId, input, enableHil: options?.enableHil ?? false };
    if (options?.executionId?.trim()) body['executionId'] = options.executionId.trim();
    if (options?.maxAgentIterations != null) body['maxAgentIterations'] = options.maxAgentIterations;
    const data = await this.request<Record<string, unknown>>('POST', this.executionsBase, body);
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
    // The platform gives the stream as a path of its own: it is read from it.
    const given = options?.streamUrl;
    const url = given ? (/^https?:/i.test(given) ? given : `${this.baseUrl}${given}`) : `${this.baseUrl}/api/v1/streams/runs/${runId}/events`;

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

  // ── Questions ────────────────────────────────────────────────────────────

  /**
   * Answers the question `requestId` of the execution `executionId` (for an interrupt, its id) with `responseText`.
   * Several questions can wait at once: the one answered is named, and the platform takes up again the run that asked
   * it. After a successful POST the backend emits `RUN_STARTED` on the open SSE channel and the run continues.
   */
  async respond(executionId: string, options: { requestId: string; responseText: string }): Promise<void> {
    await this.request('POST', `${this.executionsBase}/${executionId}/respond`, { requestId: options.requestId, response: options.responseText });
  }

  // ── Conversation ─────────────────────────────────────────────────────────

  /** Writes `message` in a conversation of the execution: the one of `options`, or its main one. To answer a question, use {@link respond}. */
  async sendMessage(executionId: string, message: string, options?: AgUiSendMessageOptions): Promise<void> {
    let threadId = options?.threadId?.trim();
    if (!threadId) {
      const threads = await this.listThreads(executionId);
      if (threads.length === 0) throw new Error(`Execution ${executionId} has no conversation to write in yet.`);
      threadId = (threads.find((t) => t.isDefault) ?? threads[0]!).threadId;
    }
    await this.request('POST', `${this.executionsBase}/${executionId}/threads/${threadId}/messages`, { text: message });
  }

  /** Lists the conversations of the execution `executionId`. */
  async listThreads(executionId: string): Promise<AgUiRunThread[]> {
    const data = await this.request<unknown>('GET', `${this.executionsBase}/${executionId}/threads`);
    return Array.isArray(data) ? data.filter((d): d is Record<string, unknown> => !!d && typeof d === 'object').map(parseRunThread) : [];
  }

  /** Lists the messages of the conversation `threadId` of the execution `executionId`. */
  async listMessages(executionId: string, threadId: string): Promise<AgUiThreadMessage[]> {
    const data = await this.request<unknown>('GET', `${this.executionsBase}/${executionId}/threads/${threadId}/messages`);
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
