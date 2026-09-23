import type { AgUiEvent } from '../../protocol/events.js';
import type { RunAgentInput } from '../../protocol/run-agent-input.js';
import { AgUiGenericConnector } from './generic-connector.js';

/**
 * Connector for the [Agentivity](https://agentivity.com) platform — port of
 * `AgentivityConnector`.
 *
 * Provides typed methods for running single agents or teams of agents,
 * resuming interrupted runs, and cancelling in-progress runs — all backed by
 * the AG-UI event protocol.
 *
 * ## Quick start
 * ```ts
 * const connector = new AgentivityConnector({ apiKey: 'ag_live_...', organizationId: 'org_...' });
 * const unsubscribe = connector.runAgent(
 *   { agentId: 'product-search', input: { threadId: 'thread-1', runId: 'run-1', messages: [buildAgUiMessage('user', { text: 'Find me an espresso machine' })] } },
 *   (event) => generativeController.feedEvent(event),
 * );
 * ```
 *
 * ## Resuming after an interrupt
 * ```ts
 * const unsubscribe = connector.resumeAgent({
 *   agentId: 'product-search',
 *   input: { threadId: 'thread-1', runId: 'run-2', messages: previousMessages, resume: [{ interruptId: interrupt.id, status: 'resolved', response: { choice: 'p2' } }] },
 * }, onEvent);
 * ```
 */
export class AgentivityConnector {
  /** Your Agentivity API key. */
  readonly apiKey: string;
  /** Agentivity API base URL. Override for self-hosted deployments. */
  readonly baseUrl: string;
  /** Optional organization ID. Required if your key has access to multiple organizations. */
  readonly organizationId?: string;
  private readonly inner: AgUiGenericConnector;
  private readonly fetchImpl: typeof fetch;

  constructor(args: { apiKey: string; baseUrl?: string; organizationId?: string; fetchImpl?: typeof fetch }) {
    this.apiKey = args.apiKey;
    this.baseUrl = args.baseUrl ?? 'https://api.agentivity.com';
    this.organizationId = args.organizationId;
    this.fetchImpl = args.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.inner = new AgUiGenericConnector({
      baseUrl: this.baseUrl,
      headers: { 'x-api-key': this.apiKey, ...(this.organizationId ? { 'x-organization-id': this.organizationId } : {}) },
      fetchImpl: this.fetchImpl,
    });
  }

  // ── Single-agent runs ────────────────────────────────────────────────────

  /**
   * Starts a run for the agent identified by `agentId` and subscribes
   * `listener` to the resulting AG-UI event stream. Returns an unsubscribe
   * function. The stream ends when `RUN_FINISHED` or `RUN_ERROR` arrives;
   * reconnection is handled automatically.
   *
   * To resume after an interrupt, populate `input.resume` and call this
   * method again — or use {@link resumeAgent}.
   */
  runAgent(args: { agentId: string; input: RunAgentInput }, listener: (event: AgUiEvent) => void): () => void {
    return this.inner.run({ path: `/v1/agents/${args.agentId}/runs`, input: args.input }, listener);
  }

  /**
   * Convenience wrapper: resumes agent `agentId` after an interrupt.
   * Equivalent to calling {@link runAgent} with `input.resume` populated —
   * `input` should carry a new `runId` and the conversation history
   * (including messages produced during the previous run).
   */
  resumeAgent(args: { agentId: string; input: RunAgentInput }, listener: (event: AgUiEvent) => void): () => void {
    if (!args.input.resume || args.input.resume.length === 0) {
      throw new Error('resumeAgent: input.resume must contain at least one ResumePayload. Did you mean to call runAgent() instead?');
    }
    return this.runAgent(args, listener);
  }

  // ── Team runs ─────────────────────────────────────────────────────────────

  /**
   * Starts a run for the agent team identified by `teamId`. A team run
   * orchestrates multiple agents in coordination; the event stream is
   * identical in shape to a single-agent run — individual agent steps are
   * surfaced as `STEP_STARTED`/`STEP_FINISHED` events.
   */
  runTeam(args: { teamId: string; input: RunAgentInput }, listener: (event: AgUiEvent) => void): () => void {
    return this.inner.run({ path: `/v1/teams/${args.teamId}/runs`, input: args.input }, listener);
  }

  /** Convenience wrapper: resumes team `teamId` after an interrupt. See {@link resumeAgent} for the resume pattern. */
  resumeTeam(args: { teamId: string; input: RunAgentInput }, listener: (event: AgUiEvent) => void): () => void {
    if (!args.input.resume || args.input.resume.length === 0) {
      throw new Error('resumeTeam: input.resume must contain at least one ResumePayload. Did you mean to call runTeam() instead?');
    }
    return this.runTeam(args, listener);
  }

  // ── Cancellation ──────────────────────────────────────────────────────────

  /**
   * Cancels an in-progress agent or team run. Sends `DELETE /v1/runs/{runId}`.
   * Callers should also dispose any active SSE subscription for the run's
   * event stream. Throws if the server returns a non-2xx status.
   */
  async cancel(args: { runId: string }): Promise<void> {
    const headers: Record<string, string> = { 'x-api-key': this.apiKey, ...(this.organizationId ? { 'x-organization-id': this.organizationId } : {}) };
    const response = await this.fetchImpl(`${this.baseUrl}/v1/runs/${args.runId}`, { method: 'DELETE', headers });
    if (!response.ok) {
      throw new Error(`AgentivityConnector.cancel: DELETE /v1/runs/${args.runId} failed with status ${response.status}`);
    }
  }
}
