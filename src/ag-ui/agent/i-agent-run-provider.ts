import type { AgentRunStarted, AgentRunStatus, AgentRunStreamEvent } from './agent-run-models.js';
import type { EntityUnit } from '../../client/domain/entity-models.js';

/** Generic agent run provider — implement this against any backend. Port of `IAgentRunProvider`. */
export interface IAgentRunProvider {
  /** Browse the catalog of runnable entities (agents, teams, workflows…). */
  listEntities(options?: { kind?: string }): Promise<EntityUnit[]>;

  startRun(args: { agentId: string; input: string }): Promise<AgentRunStarted>;
  fetchRun(args: { agentId: string; runId: string }): Promise<AgentRunStatus>;
  listRuns(args: { agentId: string }): Promise<AgentRunStatus[]>;
  cancelRun(args: { agentId: string; runId: string }): Promise<void>;

  /**
   * Subscribes to SSE events for a running agent. The implementation decides
   * the transport (SSE, WebSocket, polling…) — use {@link AgUiSseChannel} from
   * the protocol module as a building block. Returns an unsubscribe function.
   */
  streamRun(args: { runId: string }, listener: (event: AgentRunStreamEvent) => void): () => void;
}
