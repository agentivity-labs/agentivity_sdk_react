import type { ExecutionMemberStep, ExecutionStepState } from '../client/domain/execution-status-models.js';
import type { AgUiTeamMember } from './components/team-member.js';

/** Where one agent stands in the widget: `pending` is an agent not reached yet (or a manager between two turns). */
export type TeamProgressStatus = 'pending' | ExecutionStepState;

/** Where the execution stands: `working` and `waiting` can still change, the others are its end. */
export type TeamProgressPhase = 'working' | 'waiting' | 'done' | 'failed' | 'stopped';

export interface TeamProgressAgent {
  memberEntityId: string;
  displayName: string;
  /** The member as the team defines it, when the app can read the team. */
  member?: AgUiTeamMember;
  /** The manager of a manager-led team: what it writes is for its team or is the answer itself, so it has no result to open. */
  isManager: boolean;
  status: TeamProgressStatus;
  /** A few words for a customer on what it does or has done. Absent, the widget says its status only. */
  description?: string;
  /** Its result, in full (Markdown), once its turn is done. */
  result?: string;
}

export interface TeamProgress {
  executionId: string;
  phase: TeamProgressPhase;
  /** One line per agent: every member while it works, those that took part once it has ended. */
  agents: TeamProgressAgent[];
  /** Agents other than the manager, and how many of them are done. */
  total: number;
  done: number;
  /** How many agents took part, the manager included. */
  worked: number;
  /** How long it took, once it has ended and the platform says. */
  durationMs?: number;
  /** False until the team really works together: a manager answering alone needs no list. */
  visible: boolean;
  /** What the platform says of the execution: for a chat reopened after it happened. */
  jobFinished?: boolean;
  closed?: boolean;
}

export interface TeamProgressInput {
  executionId: string;
  members?: AgUiTeamMember[];
  /** What the stream said, always there: statuses and names of the members that took a turn. */
  streamStatuses: ReadonlyMap<string, ExecutionStepState>;
  seenMembers: ReadonlyMap<string, string | undefined>;
  /** What each member at work is about to do, as the stream said it. */
  streamActivities?: ReadonlyMap<string, string>;
  /** What the execution's progress said: every member, and the results. */
  steps: ReadonlyMap<string, ExecutionMemberStep>;
  executionState: string;
  jobFinished?: boolean;
  closed?: boolean;
  lastStepAt?: string;
  startedAt?: string;
  questionPending: boolean;
  awaitingResponse: boolean;
  failed: boolean;
}

function phaseOf(input: TeamProgressInput): TeamProgressPhase {
  if (input.questionPending) return 'waiting';
  switch (input.executionState) {
    case 'pending':
    case 'running':
      return 'working';
    case 'paused':
    case 'waitingforinput':
      return 'waiting';
    case 'completed':
      return 'done';
    case 'failed':
      return 'failed';
    case 'cancelled':
    case 'interrupted':
      return 'stopped';
  }
  // The stream alone: it says nothing of the state of the execution, only what goes on.
  if (input.failed) return 'failed';
  if (input.awaitingResponse || [...input.streamStatuses.values()].includes('working')) return 'working';
  return [...input.streamStatuses.values()].includes('waiting') ? 'waiting' : 'done';
}

/** Puts together what the stream and the execution's progress say into one line per agent. */
export function buildTeamProgress(input: TeamProgressInput): TeamProgress {
  const { members = [], steps, streamStatuses, streamActivities, seenMembers } = input;
  const phase = phaseOf(input);
  const live = phase === 'working' || phase === 'waiting';
  const managerId = members[0]?.topology?.kind === 'manager-led' ? members[0].memberEntityId : [...steps.values()].find((s) => s.isManager)?.memberEntityId;
  const byId = new Map(members.map((m) => [m.memberEntityId, m]));
  const ids = new Set([...byId.keys(), ...steps.keys(), ...seenMembers.keys()]);

  const agents: TeamProgressAgent[] = [...ids].map((id) => {
    const step = steps.get(id);
    const isManager = id === managerId;
    // The stream is ahead of the progress while it goes on, and an ended execution is what the progress says.
    const said = live ? (streamStatuses.get(id) ?? step?.state) : (step?.state ?? streamStatuses.get(id));
    let status: TeamProgressStatus = said ?? 'pending';
    if (!live && (status === 'working' || status === 'waiting')) status = 'done';
    // Between two turns a manager is not done: the team still works for it.
    if (isManager && live && status === 'done') status = 'pending';
    const worker = !isManager && status === 'done';
    return {
      memberEntityId: id,
      displayName: byId.get(id)?.displayName ?? step?.displayName ?? seenMembers.get(id) ?? id,
      member: byId.get(id),
      isManager,
      status,
      description: isManager ? undefined : status === 'working' ? (streamActivities?.get(id) ?? step?.activity) : worker ? (step?.summary ?? summarizeForCustomer(step?.result)) : undefined,
      result: worker ? step?.result : undefined,
    };
  });

  const acted = agents.filter((a) => a.status !== 'pending' || (a.isManager && (streamStatuses.has(a.memberEntityId) || steps.has(a.memberEntityId))));
  const workers = agents.filter((a) => !a.isManager);
  const workersActed = acted.filter((a) => !a.isManager);
  const durationMs = live ? undefined : duration(input.startedAt, input.lastStepAt);
  return {
    executionId: input.executionId,
    phase,
    agents: live ? agents : acted,
    total: workers.length,
    done: workers.filter((a) => a.status === 'done').length,
    worked: acted.length,
    durationMs,
    // Without the team's definition the manager is not known: a second agent is what says they work together.
    visible: managerId ? workersActed.length > 0 : workersActed.length > 1,
    jobFinished: input.jobFinished,
    closed: input.closed,
  };
}

function duration(from: string | undefined, to: string | undefined): number | undefined {
  const ms = from && to ? Date.parse(to) - Date.parse(from) : NaN;
  return ms > 0 ? ms : undefined;
}

/** True while the execution can still move on. */
export function isTeamProgressLive(progress: TeamProgress): boolean {
  return progress.phase === 'working' || progress.phase === 'waiting';
}

const MAX_SUMMARY = 90;

/** A line that is not for a customer: what a team writes for itself, code, and addresses. */
const NOT_FOR_A_CUSTOMER = /@team|@context|`|[{}<>]|https?:\/\/|\b[a-z]+_[a-z_]+\b/;

/**
 * A few words for a customer out of an agent's result: its title when it has one, otherwise its first sentence. Taken from the
 * text, never made up. Anything that does not read as prose for a customer gives `undefined`: the widget then says only that the
 * agent is done. It stands in until the platform says it itself (the `summary` of a step).
 */
export function summarizeForCustomer(result: string | undefined): string | undefined {
  if (!result) return undefined;
  const lines = result
    .split('\n')
    .map(cleanLine)
    .filter((line) => line.split(/\s+/).length >= 3);
  const first = lines[0];
  if (!first || NOT_FOR_A_CUSTOMER.test(first)) return undefined;
  const sentence = /^.+?[.!?](?=\s|$)/.exec(first)?.[0] ?? first;
  const words = sentence.replace(/[.:;,]+$/, '');
  if (words.length <= MAX_SUMMARY) return words;
  return `${words.slice(0, MAX_SUMMARY).replace(/\s+\S*$/, '')}…`;
}

function cleanLine(line: string): string {
  return line
    .replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, '')
    .replace(/(\*\*|__)/g, '')
    .replace(/(^|\s)[*_](\S)/g, '$1$2')
    .replace(/(\S)[*_](?=\s|$)/g, '$1')
    .trim();
}
