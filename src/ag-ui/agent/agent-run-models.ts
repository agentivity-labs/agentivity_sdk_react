import { jsonDateTime, jsonOpt, jsonStr } from '../../shared/json-helpers.js';

/**
 * Agent run domain models — port of `agent_run_models.dart`. `AgentEntity`/
 * `AgentEntityPort` are not ported here: use {@link EntityUnit}/{@link PortDefinition}
 * from the client domain models instead (same shape, one canonical source —
 * matches how the Flutter SDK's own barrel hides the duplicate types).
 */

export interface AgentRunStarted {
  runId: string;
  agentId: string;
  streamUrl: string;
  statusUrl: string;
}

export function parseAgentRunStarted(json: Record<string, unknown>): AgentRunStarted {
  return { runId: jsonStr(json, 'runId'), agentId: jsonStr(json, 'agentId'), streamUrl: jsonStr(json, 'streamUrl'), statusUrl: jsonStr(json, 'statusUrl') };
}

export type AgentRunState = 'running' | 'completed' | 'failed' | 'cancelled';

export function agentRunStateFromApi(raw: string): AgentRunState {
  switch (raw.trim().toLowerCase()) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'running';
  }
}

export function isTerminalAgentRunState(state: AgentRunState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}

export interface AgentRunStatus {
  runId: string;
  agentId: string;
  state: AgentRunState;
  content?: string;
  error?: string;
  createdAt?: Date;
  completedAt?: Date;
}

export function parseAgentRunStatus(json: Record<string, unknown>): AgentRunStatus {
  return {
    runId: jsonStr(json, 'runId'),
    agentId: jsonStr(json, 'agentId'),
    state: agentRunStateFromApi(jsonStr(json, 'state')),
    content: jsonOpt(json, 'content'),
    error: jsonOpt(json, 'error'),
    createdAt: jsonDateTime(json, 'createdAt'),
    completedAt: jsonDateTime(json, 'completedAt'),
  };
}

const TERMINAL_EVENT_NAMES = new Set(['run_completed', 'run_failed', 'run_cancelled']);

/** SSE event emitted by the agent run stream. */
export interface AgentRunStreamEvent {
  eventId: string;
  runId: string;
  kind: string;
  eventName: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export function isTerminalAgentRunStreamEvent(event: AgentRunStreamEvent): boolean {
  return TERMINAL_EVENT_NAMES.has(event.eventName);
}

export function parseAgentRunStreamEvent(json: Record<string, unknown>): AgentRunStreamEvent {
  const payload = json['payload'];
  return {
    eventId: typeof json['eventId'] === 'string' ? json['eventId'] : '',
    runId: typeof json['runId'] === 'string' ? json['runId'] : '',
    kind: typeof json['kind'] === 'string' ? json['kind'] : '',
    eventName: typeof json['eventName'] === 'string' ? json['eventName'] : '',
    occurredAt: typeof json['occurredAt'] === 'string' ? json['occurredAt'] : '',
    payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {},
  };
}
