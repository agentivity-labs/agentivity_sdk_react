/**
 * Live status of a running execution, read from its progress —
 * `GET /api/v1/executions/{id}/progress`, what a customer may read of it, a key for a web page included. One source for every kind of execution: a workflow's steps
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
  /** The same members with what each has to show, keyed by `memberEntityId`. */
  memberSteps: ReadonlyMap<string, ExecutionMemberStep>;
  /** When the last finished turn of a team ended (ISO 8601), if it has one. */
  lastStepAt?: string;
  /** Its last job is finished: the person can go on, close or start another. */
  jobFinished?: boolean;
  /** The conversation has been closed. */
  closed?: boolean;
}

/** One team member, as far as the execution's progress tells it. */
export interface ExecutionMemberStep {
  memberEntityId: string;
  displayName?: string;
  /** Absent for a member not reached yet. */
  state?: ExecutionStepState;
  /** The manager of a manager-led team: what it writes is for its team or is the answer itself. */
  isManager?: boolean;
  /** What it is doing, in a few words for a customer, when the platform says it. */
  activity?: string;
  /** What it has done, in a few words for a customer, when the platform says it. */
  summary?: string;
  /** Its last result, in full (Markdown). */
  result?: string;
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
  const memberSteps = new Map<string, ExecutionMemberStep>();
  const steps = Array.isArray(json['steps']) ? (json['steps'] as unknown[]) : [];
  for (const raw of steps) {
    if (!raw || typeof raw !== 'object') continue;
    const step = raw as Record<string, unknown>;
    const status = typeof step['status'] === 'string' ? step['status'].toLowerCase() : '';
    const state = stepState(status);
    // A team step is an agent's turn: the platform leaves `memberEntityId` null and carries the member's entity id as the step `id`,
    // marked by `agentTopologyPositionId`. A workflow step has neither.
    const isTeamStep = typeof step['agentTopologyPositionId'] === 'string' && step['agentTopologyPositionId'] !== '';
    const explicit = typeof step['memberEntityId'] === 'string' && step['memberEntityId'] ? step['memberEntityId'] : undefined;
    const memberEntityId = explicit ?? (isTeamStep && typeof step['id'] === 'string' ? step['id'] : undefined);
    // Every member is listed, those not reached yet too: they have no status to light up, only a line.
    if (!state && !(memberEntityId && status === 'pending')) continue;
    if (memberEntityId) {
      if (state) members.set(memberEntityId, state);
      memberSteps.set(memberEntityId, { memberEntityId, state, isManager: step['isManager'] === true, displayName: text(step['name']), activity: text(step['activity']), summary: text(step['summary']), result: text((step['outputs'] as Record<string, unknown> | undefined)?.['output']) });
    } else if (typeof step['id'] === 'string' && state) nodes.set(step['id'], state);
  }
  return { executionState, nodes, members, memberSteps, lastStepAt: lastOccurredAt(json['callSequence']), jobFinished: json['jobFinished'] === true, closed: json['closed'] === true };
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function lastOccurredAt(calls: unknown): string | undefined {
  if (!Array.isArray(calls)) return undefined;
  for (let i = calls.length - 1; i >= 0; i--) {
    const at = text((calls[i] as Record<string, unknown> | null)?.['occurredAt']);
    if (at) return at;
  }
  return undefined;
}
