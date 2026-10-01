/**
 * Live status of a running execution, read from its inspector snapshot —
 * `GET /api/v1/executions/{id}/inspector`. One source for every kind of execution: a workflow's steps
 * are its nodes, a team's steps are its members. `WorkflowGraph`, `TeamGraph` and `TeamRoster` all
 * light up from it (their `statuses` prop), so a diagram is right on a fresh run, after a reconnect and
 * when reopening an old execution — unlike stream events, which are not replayed.
 */

/** Where one step (a workflow node, or a team member) stands. A step not reached yet has no entry. */
export type ExecutionStepState = 'working' | 'waiting' | 'done' | 'failed';

export interface ExecutionStatuses {
  /** The run's own status, lowercase (`running`, `waitingforinput`, `completed`, `failed`, …). */
  executionState: string;
  /** Workflow nodes that have started, keyed by node id. */
  nodes: ReadonlyMap<string, ExecutionStepState>;
  /** Team members that have taken a turn, keyed by `memberEntityId`. */
  members: ReadonlyMap<string, ExecutionStepState>;
}

/** True while the execution can still change (worth polling); false once it has ended. */
export function isExecutionLive(executionState: string): boolean {
  return ['pending', 'running', 'paused', 'waitingforinput'].includes(executionState);
}

function stepState(status: string): ExecutionStepState | undefined {
  switch (status) {
    case 'running':
      return 'working';
    case 'waitingforinput':
    case 'paused':
      return 'waiting';
    case 'completed':
      return 'done';
    case 'failed':
      return 'failed';
    default:
      return undefined; // pending, cancelled, interrupted, unknown — not lit
  }
}

export function parseExecutionStatuses(json: Record<string, unknown>): ExecutionStatuses {
  const executionState = typeof json['status'] === 'string' ? json['status'].toLowerCase() : '';
  const nodes = new Map<string, ExecutionStepState>();
  const members = new Map<string, ExecutionStepState>();
  const steps = Array.isArray(json['steps']) ? (json['steps'] as unknown[]) : [];
  for (const raw of steps) {
    if (!raw || typeof raw !== 'object') continue;
    const step = raw as Record<string, unknown>;
    const state = stepState(typeof step['status'] === 'string' ? step['status'].toLowerCase() : '');
    if (!state) continue;
    // A team step is an agent's turn: the inspector leaves `memberEntityId` null and carries the member's entity id as the step `id`,
    // marked by `agentTopologyPositionId`. A workflow step has neither.
    const isTeamStep = typeof step['agentTopologyPositionId'] === 'string' && step['agentTopologyPositionId'] !== '';
    const explicit = typeof step['memberEntityId'] === 'string' && step['memberEntityId'] ? step['memberEntityId'] : undefined;
    const memberEntityId = explicit ?? (isTeamStep && typeof step['id'] === 'string' ? step['id'] : undefined);
    if (memberEntityId) members.set(memberEntityId, state);
    else if (typeof step['id'] === 'string') nodes.set(step['id'], state);
  }
  return { executionState, nodes, members };
}
