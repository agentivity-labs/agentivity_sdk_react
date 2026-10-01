import { useEffect, useRef, useState } from 'react';
import type { ChatController } from '../chat/chat-controller.js';
import { isExecutionLive, type ExecutionStepState } from '../client/domain/execution-status-models.js';
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
  /** The run's own status, lowercase (`running`, `waitingforinput`, `completed`, …) — empty until first read. */
  executionState: string;
  /** True while the execution is actively working (not waiting on a person, not finished) — drives a chat's stop button. */
  running: boolean;
}

const EMPTY: ExecutionStepStatuses = { nodes: new Map(), members: new Map(), executionState: '', running: false };

/**
 * Live per-step status of an execution — workflow nodes and team members alike — from its inspector
 * snapshot (`GET /executions/{id}/inspector`). The one source `WorkflowGraph`, `TeamGraph` and
 * `TeamRoster` light up from (their `statuses` prop): read from the API rather than rebuilt from stream
 * events, so it is right on a fresh run, after a reconnect and when reopening an old execution (stream
 * events are not replayed). Polls only while the execution can still change.
 */
export function useExecutionStatuses(executionId: string | undefined, options: UseExecutionStatusesOptions = {}): ExecutionStepStatuses {
  const client = useAgentivityClient();
  const { controller, intervalMs = 1200 } = options;
  const [statuses, setStatuses] = useState<ExecutionStepStatuses>(EMPTY);
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    setStatuses(EMPTY);
    if (!executionId) {
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
        if (result) setStatuses({ nodes: result.nodes, members: result.members, executionState: result.executionState, running: result.executionState === 'running' || result.executionState === 'pending' });
        // An unreachable status (undefined) is retried like a live one — a blip must not freeze the diagram.
        schedule(result ? isExecutionLive(result.executionState) : true);
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
