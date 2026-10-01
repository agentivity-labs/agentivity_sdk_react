import { AgentivityHttpCore } from '../http-core.js';
import {
  type ExecutionRecord,
  type HilPendingResponse,
  type HilRespondResult,
  type ImageAttachmentInput,
  type RunInteractionResponse,
  type SessionStartedResponse,
  parseExecutionRecord,
  parseHilPendingResponse,
  parseRunInteractionResponse,
  parseSessionStartedResponse,
} from '../domain/entity-models.js';
import { parseExecutionStatuses, type ExecutionStatuses } from '../domain/execution-status-models.js';

/**
 * Run lifecycle endpoints: start, HIL, interactions, and SSE streams.
 *
 * "Execution" is the user-facing, launched concept (`POST /api/v1/executions`);
 * a "run" is an internal engine-level detail — one execution can contain a tree
 * of runs (e.g. a team's per-member turns).
 */
export class RunsApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  // ---------------------------------------------------------------------------
  // Unified execution start — POST /api/v1/executions
  // ---------------------------------------------------------------------------

  async startExecution(args: {
    entityId: string;
    input: string;
    executionId?: string;
    enableHil?: boolean;
    maxAgentIterations?: number;
    /** Images attached to this turn (vision) — agent-kind executions only for now. */
    images?: ImageAttachmentInput[];
  }): Promise<SessionStartedResponse> {
    const entityId = this.c.requireNormalizedId(args.entityId, 'Entity id');
    const body: Record<string, unknown> = {
      entityId,
      input: args.input,
      executionId: args.executionId?.trim() || undefined,
      enableHil: args.enableHil ?? false,
    };
    if (args.maxAgentIterations != null) body['maxAgentIterations'] = args.maxAgentIterations;
    if (args.images && args.images.length > 0) body['images'] = args.images;

    const data = await this.c.post<Record<string, unknown>>(AgentivityHttpCore.v1('/executions'), body);
    return parseSessionStartedResponse(data ?? {});
  }

  // ---------------------------------------------------------------------------
  // Execution lifecycle — POST /api/v1/executions/{executionId}/...
  // ---------------------------------------------------------------------------

  async cancelExecution(executionId: string): Promise<void> {
    await this.c.post<void>(AgentivityHttpCore.v1(`/executions/${executionId}/cancel`));
  }

  async pauseExecution(executionId: string): Promise<void> {
    await this.c.post<void>(AgentivityHttpCore.v1(`/executions/${executionId}/pause`));
  }

  async unpauseExecution(executionId: string): Promise<void> {
    await this.c.post<void>(AgentivityHttpCore.v1(`/executions/${executionId}/unpause`));
  }

  // ---------------------------------------------------------------------------
  // HIL — GET /api/v1/executions/{executionId}/hil/pending
  //         POST /api/v1/runs/{runId}/resume (see submitHilResponse below)
  // ---------------------------------------------------------------------------

  async fetchPendingHil(executionId: string): Promise<HilPendingResponse> {
    const normalized = this.c.requireNormalizedId(executionId, 'Execution id');
    const data = await this.c.get<Record<string, unknown>>(AgentivityHttpCore.v1(`/executions/${normalized}/hil/pending`));
    return parseHilPendingResponse(data ?? {});
  }

  /**
   * Submits a reply to a pending HIL gate. Internally calls `POST /runs/{runId}/resume` — NOT
   * `POST /executions/{executionId}/respond` (the latter resumes the run but never persists the
   * reply as a chat message, so it silently vanishes from any chat transcript rendered from
   * `CHAT_MESSAGE_RECEIVED` events). The route's `{runId}` segment is resolved server-side by the
   * request's `interruptId` regardless of what's passed — the backend's own doc comment on that
   * endpoint confirms this is intended ("may need lookup when the frontend only knows the
   * streamId") — so `executionId` is used there directly; callers of this method never need a
   * real run id. Return shape is unchanged from the previous implementation; the only signature
   * addition is the optional `source`, needed so the backend can tag a widget-submitted reply as
   * such (`ChatMessageBubble` hides widget-sourced messages — the widget itself already displays
   * the answer inline, so without this tag a widget submission renders as a second, duplicate
   * bubble now that replies are actually persisted to the chat).
   */
  async submitHilResponse(args: { executionId: string; requestId: string; response: string; source?: string }): Promise<HilRespondResult> {
    const normalizedExecution = this.c.requireNormalizedId(args.executionId, 'Execution id');
    const normalizedRequest = this.c.requireNormalizedId(args.requestId, 'Request id');
    const data = await this.c.post<Record<string, unknown>>(AgentivityHttpCore.v1(`/runs/${normalizedExecution}/resume`), {
      interruptId: normalizedRequest,
      response: { text: args.response, source: args.source },
    });
    // /runs/{runId}/resume responds with {runId, status}, not the {executionId, requestId,
    // runId, state} shape HilRespondResult callers expect — executionId/requestId are already
    // known here (they're this method's own inputs), so the result is built locally instead of
    // parsed wholesale from the response body.
    return {
      executionId: args.executionId,
      runId: String(data?.['runId'] ?? args.executionId).trim(),
      requestId: args.requestId,
      state: String(data?.['status'] ?? 'resumed').trim(),
    };
  }

  // ---------------------------------------------------------------------------
  // Send message or HIL response — POST /api/v1/runs/{runId}/interactions
  // ---------------------------------------------------------------------------

  async sendRunInteraction(args: {
    runId: string;
    message: string;
    threadId?: string;
    authorId?: string;
    authorName?: string;
    interactionRequestId?: string;
    outcome?: string;
    executionId?: string;
  }): Promise<RunInteractionResponse> {
    const normalizedRunId = this.c.requireNormalizedId(args.runId, 'Run id');
    const body: Record<string, unknown> = { message: args.message };
    if (args.threadId?.trim()) body['threadId'] = args.threadId.trim();
    if (args.authorId?.trim()) body['authorId'] = args.authorId.trim();
    if (args.authorName?.trim()) body['authorName'] = args.authorName.trim();
    if (args.interactionRequestId?.trim()) body['interactionRequestId'] = args.interactionRequestId.trim();
    if (args.outcome?.trim()) body['outcome'] = args.outcome.trim();
    if (args.executionId?.trim()) body['executionId'] = args.executionId.trim();

    const data = await this.c.post<Record<string, unknown>>(AgentivityHttpCore.v1(`/runs/${normalizedRunId}/interactions`), body);
    return parseRunInteractionResponse(data ?? {});
  }

  // ---------------------------------------------------------------------------
  // Executions by entity — GET /api/v1/executions?entityId={id}
  // ---------------------------------------------------------------------------

  async fetchExecutionsByEntityId(entityId: string): Promise<ExecutionRecord[]> {
    const normalizedId = this.c.requireNormalizedId(entityId, 'Entity id');
    const data = await this.c.get<Record<string, unknown>>(AgentivityHttpCore.v1('/executions'), {
      query: { entityId: normalizedId },
    });
    const items = Array.isArray(data?.['executions']) ? (data!['executions'] as unknown[]) : [];
    return items.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object').map(parseExecutionRecord);
  }

  // ---------------------------------------------------------------------------
  // Execution record — GET /api/v1/executions/{executionId}
  // Returns channels (channelType → threadId) and execution metadata.
  // ---------------------------------------------------------------------------

  async fetchExecution(executionId: string): Promise<ExecutionRecord | undefined> {
    const normalized = this.c.requireNormalizedId(executionId, 'Execution id');
    try {
      const data = await this.c.get<Record<string, unknown>>(AgentivityHttpCore.v1(`/executions/${normalized}`));
      return data ? parseExecutionRecord(data) : undefined;
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Live step statuses — GET /api/v1/executions/{executionId}/inspector
  // The authoritative per-step state (workflow nodes, team members) of any execution: valid on a fresh run,
  // after a reconnect and when reopening an old execution — unlike stream events, which are not replayed.
  // ---------------------------------------------------------------------------

  async fetchExecutionStatuses(executionId: string): Promise<ExecutionStatuses | undefined> {
    const normalized = this.c.requireNormalizedId(executionId, 'Execution id');
    try {
      const data = await this.c.get<Record<string, unknown>>(AgentivityHttpCore.v1(`/executions/${normalized}/inspector`));
      return data ? parseExecutionStatuses(data) : undefined;
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Unified cancel — POST /api/v1/runs/{runId}/cancel
  // ---------------------------------------------------------------------------

  async cancelRun(runId: string): Promise<void> {
    const normalizedRunId = this.c.requireNormalizedId(runId, 'Run id');
    await this.c.post<void>(AgentivityHttpCore.v1(`/runs/${normalizedRunId}/cancel`));
  }

  // ---------------------------------------------------------------------------
  // Stream-scoped HIL response — POST /api/v1/streams/{streamId}/interactions
  // Chat uses only streamId + requestId. The backend resolves the runId internally.
  // ---------------------------------------------------------------------------

  async respondToStreamInteraction(args: { streamId: string; requestId: string; text: string; source?: string }): Promise<void> {
    const normalizedStreamId = this.c.requireNormalizedId(args.streamId, 'Stream id');
    await this.c.post<void>(AgentivityHttpCore.v1(`/streams/${normalizedStreamId}/interactions`), {
      requestId: args.requestId,
      text: args.text,
      source: args.source ?? 'text',
    });
  }

  // ---------------------------------------------------------------------------
  // AG-UI standard resume — POST /api/v1/runs/{runId}/resume
  // ---------------------------------------------------------------------------

  async resumeRun(args: { runId: string; interruptId: string; responseText: string; source?: string }): Promise<void> {
    const normalizedRunId = this.c.requireNormalizedId(args.runId, 'Run id');
    await this.c.post<void>(AgentivityHttpCore.v1(`/runs/${normalizedRunId}/resume`), {
      interruptId: args.interruptId,
      response: { text: args.responseText, source: args.source },
    });
  }

  // ---------------------------------------------------------------------------
  // SSE stream — raw Response, feed into AgUiSseChannel via AgentivityHttpCore.openStream
  // ---------------------------------------------------------------------------

  openEventStream(path: string, options?: { lastEventId?: string; signal?: AbortSignal }): Promise<Response> {
    return this.c.openStream(path, options);
  }
}
