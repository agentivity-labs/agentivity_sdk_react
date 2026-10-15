import { AgentivityHttpCore } from '../http-core.js';
import {
  type ExecutionRecord,
  type HilPendingResponse,
  type HilRespondResult,
  type ImageAttachmentInput,
  type SessionStartedResponse,
  parseExecutionRecord,
  parseHilPendingResponse,
  parseHilRespondResult,
  parseSessionStartedResponse,
} from '../domain/entity-models.js';
import { parseExecutionStatuses, type ExecutionStatuses } from '../domain/execution-status-models.js';

/**
 * Execution lifecycle endpoints: start, questions to a person, and SSE streams.
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
  // Questions of an execution — GET /api/v1/executions/{executionId}/hil/pending
  //                             POST /api/v1/executions/{executionId}/respond
  // ---------------------------------------------------------------------------

  async fetchPendingHil(executionId: string): Promise<HilPendingResponse> {
    const normalized = this.c.requireNormalizedId(executionId, 'Execution id');
    const data = await this.c.get<Record<string, unknown>>(AgentivityHttpCore.v1(`/executions/${normalized}/hil/pending`));
    return parseHilPendingResponse(data ?? {});
  }

  /**
   * Answers the question `requestId` of the execution `executionId`, whatever the channel it was asked through (chat,
   * form, widget…). Several questions can wait at once: the one answered is named, and the platform takes up again the
   * run that asked it. The answer is kept in the conversation the question was asked in; `source` is `'widget'` when a
   * widget gave it (the widget shows the answer itself, so the chat does not show it again).
   */
  async submitHilResponse(args: { executionId: string; requestId: string; response: string; source?: string }): Promise<HilRespondResult> {
    const normalizedExecution = this.c.requireNormalizedId(args.executionId, 'Execution id');
    const normalizedRequest = this.c.requireNormalizedId(args.requestId, 'Request id');
    const body: Record<string, unknown> = { requestId: normalizedRequest, response: args.response };
    if (args.source) body['source'] = args.source;
    const data = await this.c.post<Record<string, unknown>>(AgentivityHttpCore.v1(`/executions/${normalizedExecution}/respond`), body);
    return parseHilRespondResult(data ?? {});
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
      const data = await this.c.get<Record<string, unknown>>(AgentivityHttpCore.v1(`/executions/${normalized}/inspector`), { dataBody: true });
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
  // SSE stream — raw Response, feed into AgUiSseChannel via AgentivityHttpCore.openStream
  // ---------------------------------------------------------------------------

  openEventStream(path: string, options?: { lastEventId?: string; signal?: AbortSignal }): Promise<Response> {
    return this.c.openStream(path, options);
  }
}
