import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ChatController } from '../chat/chat-controller.js';
import { teamMembersFromStructure, type AgUiTeamMember } from '../chat/components/team-member.js';
import { buildTeamProgress, type TeamProgress } from '../chat/team-progress.js';
import { useOptionalAgentivityClient } from './AgentivityProvider.js';
import { useExecutionStatusesOf } from './useExecutionStatuses.js';

export interface UseTeamProgressOptions {
  /** The execution to follow. Left out, the one the stream tells about; give it to show an execution reopened from its history. */
  executionId?: string;
  /** The team's members. Left out, read from the team of the execution; a key for a web page cannot, the app then gives them. */
  members?: AgUiTeamMember[];
  /** Turned off, it reads nothing and gives `undefined`. Default true. */
  enabled?: boolean;
}

/**
 * Where each agent of a team stands in the execution of a chat: what `ChatTeamProgress` draws. Needs nothing from the app. What it
 * The execution's progress gives every agent and each one's result, a key for a web page included; the team's definition, when the
 * key can read it, adds how the app draws them. Without a client it goes by the stream alone: names, statuses and what each is doing.
 */
export function useTeamProgress(controller: ChatController, options: UseTeamProgressOptions = {}): TeamProgress | undefined {
  const { executionId: givenId, members: givenMembers, enabled = true } = options;
  const client = useOptionalAgentivityClient();
  const streamId = useSyncExternalStore(controller.subscribe, () => controller.executionId);
  const streamStatuses = useSyncExternalStore(controller.subscribe, () => controller.memberStatuses);
  const seenMembers = useSyncExternalStore(controller.subscribe, () => controller.seenMembers);
  const streamActivities = useSyncExternalStore(controller.subscribe, () => controller.memberActivities);
  const questionPending = useSyncExternalStore(controller.subscribe, () => controller.pendingHilGate != null);
  const awaitingResponse = useSyncExternalStore(controller.subscribe, () => controller.isAwaitingResponse);
  const failed = useSyncExternalStore(controller.subscribe, () => controller.runError != null);

  const executionId = enabled ? (givenId ?? streamId) : undefined;
  const statuses = useExecutionStatusesOf(client, executionId, { controller, intervalMs: 2500 });

  const [startedAt, setStartedAt] = useState<string>();
  const [teamMembers, setTeamMembers] = useState<AgUiTeamMember[]>();
  const teamRead = useRef<string>(undefined);
  useEffect(() => {
    setStartedAt(undefined);
    if (!client || !executionId) return;
    let alive = true;
    void (async () => {
      const execution = await client.runs.fetchExecution(executionId);
      if (!alive || !execution) return;
      setStartedAt(execution.createdAt);
      if (givenMembers || execution.entityKind.toLowerCase() !== 'team' || teamRead.current === execution.entityId) return;
      const team = await client.entities.fetchTeam(execution.entityId);
      if (!alive) return;
      teamRead.current = execution.entityId;
      setTeamMembers(teamMembersFromStructure(team));
    })().catch(() => undefined); // The team cannot be read: the stream says who works.
    return () => {
      alive = false;
    };
  }, [client, executionId, givenMembers]);

  const { memberSteps, executionState, lastStepAt, jobFinished, closed } = statuses;
  const members = givenMembers ?? teamMembers;
  return useMemo(() => {
    if (!executionId) return undefined;
    return buildTeamProgress({ executionId, members, streamStatuses: executionId === streamId ? streamStatuses : new Map(), seenMembers: executionId === streamId ? seenMembers : new Map(), streamActivities: executionId === streamId ? streamActivities : undefined, steps: memberSteps, executionState, jobFinished, closed, lastStepAt, startedAt, questionPending, awaitingResponse, failed });
  }, [executionId, streamId, members, streamStatuses, seenMembers, streamActivities, memberSteps, executionState, jobFinished, closed, lastStepAt, startedAt, questionPending, awaitingResponse, failed]);
}
