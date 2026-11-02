import { useEffect, useState } from 'react';
import { MarkdownBody } from '../../ag-ui/components/MarkdownBody.js';
import type { TeamProgress, TeamProgressAgent } from '../team-progress.js';
import { MemberAvatar, type AgUiChatMember, type AgUiMemberAvatar } from './member-avatar.js';
import { groupColorOverrides, teamGroupColors, teamGroupKey } from './team-groups.js';
import { memberAvatarFor } from './team-member.js';

/** The words of the widget, each with an English default. */
export interface ChatTeamProgressTexts {
  working: string;
  waiting: string;
  /** "2 of 4 done" while it works. */
  count: (done: number, total: number) => string;
  /** The line it collapses to, `took` being "4 min 32 s" when the platform says how long it took. */
  finished: (agents: number, took: string | undefined) => string;
  failed: (agents: number) => string;
  stopped: (agents: number) => string;
  agentPending: string;
  agentWorking: string;
  agentWaiting: string;
  agentDone: string;
  agentFailed: string;
  managerWorking: string;
  managerDone: string;
  openResult: string;
  closeResult: string;
}

const agents = (n: number) => `${n} agent${n === 1 ? '' : 's'}`;

export const defaultTeamProgressTexts: ChatTeamProgressTexts = {
  working: 'Your team is working',
  waiting: 'Waiting for your answer',
  count: (done, total) => `${done} of ${total} done`,
  finished: (n, took) => (took ? `${agents(n)} worked for ${took}` : `${agents(n)} worked on this`),
  failed: (n) => `Something went wrong · ${agents(n)} worked on this`,
  stopped: (n) => `Stopped · ${agents(n)} worked on this`,
  agentPending: 'Waiting for its turn',
  agentWorking: 'Working on it…',
  agentWaiting: 'Waiting for your answer',
  agentDone: 'Done',
  agentFailed: 'Could not finish this part',
  managerWorking: 'Organizing the work',
  managerDone: 'Brought it all together',
  openResult: 'Read the result of',
  closeResult: 'Close the result of',
};

export interface ChatTeamProgressProps {
  progress: TeamProgress;
  /** Maps a member's identity to an avatar (image/emoji/color). Falls back to the team's icons and group colors. */
  resolveMemberAvatar?: (member: AgUiChatMember) => AgUiMemberAvatar | undefined;
  /** Other words, or another language, for those to replace. */
  texts?: Partial<ChatTeamProgressTexts>;
  className?: string;
}

/**
 * The team at work, in the thread: one line per agent while an execution goes on, with what each does and a result to open. It
 * collapses to one line when the execution ends or waits for an answer; a tap opens it again. `ChatDiscussion` shows it on its own;
 * an app that lays out its chat itself gives it what `useTeamProgress` returns.
 */
export function ChatTeamProgress({ progress, resolveMemberAvatar, texts, className }: ChatTeamProgressProps) {
  const t = { ...defaultTeamProgressTexts, ...texts };
  const { phase } = progress;
  // What the person chose holds until the execution moves on.
  const [chosen, setChosen] = useState<boolean>();
  useEffect(() => setChosen(undefined), [phase, progress.executionId]);
  const open = chosen ?? phase === 'working';

  const members = progress.agents.flatMap((a) => (a.member ? [a.member] : []));
  const colors = teamGroupColors(members.map((m) => m.group), groupColorOverrides(members));

  return (
    <section className={cx('ag-team-progress', className)} data-phase={phase} aria-label="Team progress">
      <button type="button" className="ag-team-progress__head" aria-expanded={open} onClick={() => setChosen(!open)}>
        <span className="ag-team-progress__mark" data-status={markOf(phase)} aria-hidden="true" />
        <span className="ag-team-progress__title" aria-live="polite">
          {headline(progress, t)}
        </span>
        {phase === 'working' && progress.total > 0 && <span className="ag-team-progress__count">{t.count(progress.done, progress.total)}</span>}
        <span className="ag-team-progress__chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul className="ag-team-progress__agents">
          {progress.agents.map((agent) => (
            <AgentLine key={agent.memberEntityId} agent={agent} t={t} resolver={agent.member ? memberAvatarFor(agent.member, colors.get(teamGroupKey(agent.member.group) ?? ''), resolveMemberAvatar) : resolveMemberAvatar} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AgentLine({ agent, t, resolver }: { agent: TeamProgressAgent; t: ChatTeamProgressTexts; resolver?: (member: AgUiChatMember) => AgUiMemberAvatar | undefined }) {
  const [reading, setReading] = useState(false);
  const line = (
    <>
      <MemberAvatar member={{ memberEntityId: agent.memberEntityId, displayName: agent.displayName }} resolver={resolver} className="ag-team-progress__avatar" />
      <span className="ag-team-progress__text">
        <span className="ag-team-progress__name">{agent.displayName}</span>
        <span className="ag-team-progress__description">{describe(agent, t)}</span>
      </span>
      <span className="ag-team-progress__mark" data-status={agent.status} aria-hidden="true" />
    </>
  );
  return (
    <li className="ag-team-progress__agent" data-status={agent.status}>
      {agent.result ? (
        <button type="button" className="ag-team-progress__line" aria-expanded={reading} aria-label={`${reading ? t.closeResult : t.openResult} ${agent.displayName}`} onClick={() => setReading(!reading)}>
          {line}
        </button>
      ) : (
        <div className="ag-team-progress__line">{line}</div>
      )}
      {reading && agent.result && <MarkdownBody data={agent.result} className="ag-team-progress__result" />}
    </li>
  );
}

function describe(agent: TeamProgressAgent, t: ChatTeamProgressTexts): string {
  if (agent.isManager && agent.status !== 'waiting' && agent.status !== 'failed') return agent.status === 'done' ? t.managerDone : t.managerWorking;
  if (agent.description) return agent.description;
  switch (agent.status) {
    case 'working':
      return t.agentWorking;
    case 'waiting':
      return t.agentWaiting;
    case 'done':
      return t.agentDone;
    case 'failed':
      return t.agentFailed;
    default:
      return t.agentPending;
  }
}

function headline(progress: TeamProgress, t: ChatTeamProgressTexts): string {
  switch (progress.phase) {
    case 'working':
      return t.working;
    case 'waiting':
      return t.waiting;
    case 'failed':
      return t.failed(progress.worked);
    case 'stopped':
      return t.stopped(progress.worked);
    default:
      return t.finished(progress.worked, progress.durationMs ? took(progress.durationMs) : undefined);
  }
}

function markOf(phase: TeamProgress['phase']): string {
  return phase === 'stopped' ? 'pending' : phase;
}

function took(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${seconds % 60} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
