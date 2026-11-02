import { useEffect, useRef, useState } from 'react';
import type { ChatController } from '../chat/chat-controller.js';
import type { AgentivityClient } from '../client/agentivity-client.js';
import { isExecutionLive, type ExecutionMemberStep, type ExecutionStepState } from '../client/domain/execution-status-models.js';
import { useAgentivityClient } from './AgentivityProvider.js';

export interface UseExecutionStatusesOptions {
  /** When given, any chat activity (a message, a question reached/answered) refreshes at once instead of waiting for the next poll. */
  controller?: ChatController;
  /** Poll interval while the execution can still change. Default 1200 ms. */
  intervalMs?: number;
}

export interface ExecutionStepStatuses {
  /** Workflow nodes that have started — pass to `WorkflowGraph`'s `statuses`. */
  nodes: ReadonlyMap<string, ExecutionStepState>;
  /** Team members that have taken a turn — pass to `TeamGraph`/`TeamRoster`'s `statuses`. */
  members: ReadonlyMap<string, ExecutionStepState>;
  /** The same members with what each has to show — what `ChatTeamProgress` reads. */
  memberSteps: ReadonlyMap<string, ExecutionMemberStep>;
  jobFinished?: boolean;
  closed?: boolean;
  /** When the last finished turn of a team ended (ISO 8601), if it has one. */
  lastStepAt?: string;
  /** The run's own status, lowercase (`running`, `waitingforinput`, `completed`, …) — empty until first read. */
  executionState: string;
  /** True while the execution is actively working (not waiting on a person, not finished) — drives a chat's stop button. */
  running: boolean;
}

const EMPTY: ExecutionStepStatuses = { nodes: new Map(), members: new Map(), memberSteps: new Map(), executionState: '', running: false };

/**
 * Live per-step status of an execution — workflow nodes and team members alike — from its
 * progress (`GET /executions/{id}/progress`). The one source `WorkflowGraph`, `TeamGraph` and
 * `TeamRoster` light up from (their `statuses` prop): read from the API rather than rebuilt from stream
 * events, so it is right on a fresh run, after a reconnect and when reopening an old execution (stream
 * events are not replayed). Polls only while the execution can still change.
 */
export function useExecutionStatuses(executionId: string | undefined, options: UseExecutionStatusesOptions = {}): ExecutionStepStatuses {
  return useExecutionStatusesOf(useAgentivityClient(), executionId, options);
}

/** {@link useExecutionStatuses} for a component that may have no client: without one it stays empty. */
export function useExecutionStatusesOf(client: AgentivityClient | undefined, executionId: string | undefined, options: UseExecutionStatusesOptions = {}): ExecutionStepStatuses {
  const { controller, intervalMs = 1200 } = options;
  const [statuses, setStatuses] = useState<ExecutionStepStatuses>(EMPTY);
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    setStatuses(EMPTY);
    if (!executionId || !client) {
      refreshRef.current = () => undefined;
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;

    const schedule = (live: boolean) => {
      if (timer) clearTimeout(timer);
      if (alive && live) timer = setTimeout(() => void refresh(), intervalMs);
    };

    const refresh = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      try {
        const result = await client.runs.fetchExecutionStatuses(executionId);
        if (!alive) return;
        if (result) setStatuses({ nodes: result.nodes, members: result.members, memberSteps: result.memberSteps, lastStepAt: result.lastStepAt, jobFinished: result.jobFinished, closed: result.closed, executionState: result.executionState, running: result.executionState === 'running' || result.executionState === 'pending' });
        // An unreachable status (undefined) is retried like a live one — a blip must not freeze the diagram. A refusal (null) will not change.
        schedule(result ? isExecutionLive(result.executionState) : result === undefined);
      } finally {
        inFlight = false;
      }
    };

    refreshRef.current = () => void refresh();
    void refresh();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [client, executionId, intervalMs]);

  useEffect(() => {
    if (!controller) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = controller.subscribe(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => refreshRef.current(), 250);
    });
    return () => {
      unsubscribe();
      if (debounce) clearTimeout(debounce);
    };
  }, [controller]);

  return statuses;
}
