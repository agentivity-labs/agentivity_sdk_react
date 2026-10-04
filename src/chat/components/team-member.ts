import type { TeamStructure } from '../../client/domain/team-definition-models.js';
import { teamManager } from '../../client/domain/team-definition-models.js';
import type { AgUiChatMember, AgUiMemberAvatar } from './member-avatar.js';
import type { IconRef } from '../../icons/icon-ref.js';
import type { TeamMemberStatus } from '../chat-controller.js';
import { groupColorOverrides, teamGroupColors, teamGroupKey } from './team-groups.js';

/** How a team's members work together — what the team graph draws. Mirrors the backend's orchestrators. */
export type AgUiTeamTopologyKind = 'manager-led' | 'sequential' | 'concurrent' | 'handoff' | 'group-chat';

/** A directed link between two members, by `memberEntityId`. */
export interface AgUiTeamLink {
  from: string;
  to: string;
}

/**
 * The shape of a team: how its members are organized (`kind`) and the directed links the team editor drew between them.
 * `TeamGraph` draws each kind differently — a hub for a manager-led team, a chain for a sequential one, parallel lanes for
 * a concurrent one, a ring of peers for a handoff, a shared table for a group chat.
 */
export interface AgUiTeamTopology {
  kind: AgUiTeamTopologyKind;
  /** The links saved in the team (sequential: who hands over to whom; handoff: who may delegate to whom). Empty when the team defines none. */
  links: AgUiTeamLink[];
}

/** A member of the Team being shown by `TeamRoster` / `TeamGraph`. `memberEntityId` must match the id the backend reports on `STEP_STARTED`/`STEP_FINISHED`. */
export interface AgUiTeamMember {
  memberEntityId: string;
  displayName: string;
  /** Short caption under the member in `TeamGraph`; defaults to `displayName` without its trailing role word ("Flight Specialist" → "Flight"), truncated to fit. */
  label?: string;
  /** The icon the team editor gave this member (a reference into the platform's icon catalog). Drawn when the app's own avatar resolver has nothing for this member. */
  icon?: IconRef;
  /** The group the team editor put this member in; members of a group are drawn together and share a color. */
  group?: string;
  /** The color the team editor chose for this member's group (`#RRGGBB`); absent = the default color. */
  groupColor?: string;
  /**
   * The shape of the whole team, set by {@link teamMembersFromStructure} on every member so `TeamGraph` can draw the right
   * layout from the members alone. An app that builds its members by hand can pass `topology` to `TeamGraph` instead.
   */
  topology?: AgUiTeamTopology;
}

/** A team's saved definition, ready for `TeamRoster` / `TeamGraph`: one member each, with the icon and group the team editor set. */
export function teamMembersFromStructure(team: TeamStructure): AgUiTeamMember[] {
  const topology = teamTopology(team);
  return team.members.map((m) => ({ memberEntityId: m.memberEntityId, displayName: m.displayName ?? m.memberEntityId, icon: m.icon, group: m.group, groupColor: team.groupColors[teamGroupKey(m.group) ?? ''], topology }));
}

const TOPOLOGY_KINDS: Record<string, AgUiTeamTopologyKind> = {
  'manager-led': 'manager-led',
  managerled: 'manager-led',
  manager_led: 'manager-led',
  sequential: 'sequential',
  concurrent: 'concurrent',
  parallel: 'concurrent',
  handoff: 'handoff',
  'group-chat': 'group-chat',
  groupchat: 'group-chat',
  group_chat: 'group-chat',
};

/** The shape of a team as saved, or `undefined` for an orchestrator this SDK does not know (the graph then falls back to its default drawing). */
export function teamTopology(team: TeamStructure): AgUiTeamTopology | undefined {
  const kind = TOPOLOGY_KINDS[team.orchestratorId.trim().toLowerCase()];
  if (!kind) return undefined;
  const memberOf = new Map(team.members.map((m) => [m.topologyPositionId, m.memberEntityId]));
  const links: AgUiTeamLink[] = [];
  for (const c of team.connections) {
    const from = memberOf.get(c.fromTopologyPositionId);
    const to = memberOf.get(c.toTopologyPositionId);
    if (from && to && from !== to && !links.some((l) => l.from === from && l.to === to)) links.push({ from, to });
  }
  return { kind, links };
}

/** The id to pass as `hubMemberId` — the manager of a manager-led team, otherwise `undefined`. */
export function teamHubMemberId(team: TeamStructure): string | undefined {
  return teamManager(team)?.memberEntityId;
}

const ROLE_WORDS = new Set(['specialist', 'agent', 'advisor', 'assistant']);

/** A member's name without the generic role word it usually ends with — "Flight Specialist" → "Flight", "On-Trip Assistant" → "On-Trip". */
export function teamMemberShortName(displayName: string): string {
  const words = displayName.trim().split(/\s+/);
  const last = words[words.length - 1]?.toLowerCase();
  return words.length > 1 && last && ROLE_WORDS.has(last) ? words.slice(0, -1).join(' ') : displayName.trim();
}

type AvatarResolver = (member: AgUiChatMember) => AgUiMemberAvatar | undefined;

/**
 * The avatar resolver for one team member: the app's own answer first (an image or emoji it chose), then the icon and
 * group color the team editor gave the member, so a team drawn from its saved definition needs no app-side mapping.
 */
export function memberAvatarFor(member: AgUiTeamMember, groupColor: string | undefined, resolver?: AvatarResolver): AvatarResolver {
  return (chatMember) => {
    const resolved = resolver?.(chatMember);
    return { imageUrl: resolved?.imageUrl, emoji: resolved?.emoji, icon: resolved?.icon ?? member.icon, color: resolved?.color ?? groupColor, initials: resolved?.initials };
  };
}

/**
 * An avatar resolver for chat speaker labels and the active-member indicator, drawing each member with the icon and
 * group color the team editor gave it — so a chat, a roster and a graph show the same member the same way. Pass it as
 * `resolveMemberAvatar`; `fallback` answers first for a member the app wants to draw differently (an image).
 */
export function teamAvatarResolver(members: AgUiTeamMember[], fallback?: AvatarResolver): AvatarResolver {
  const colors = teamGroupColors(members.map((m) => m.group), groupColorOverrides(members));
  const byId = new Map(members.map((m) => [m.memberEntityId, m]));
  return (chatMember) => {
    const resolved = fallback?.(chatMember);
    const member = chatMember.memberEntityId ? byId.get(chatMember.memberEntityId) : undefined;
    if (!member) return resolved;
    return memberAvatarFor(member, colors.get(teamGroupKey(member.group) ?? ''), fallback)(chatMember);
  };
}

/** Text for a member's status, shared by both components' tooltips and screen-reader text. */
export function teamMemberStatusText(status: TeamMemberStatus | undefined): string {
  switch (status) {
    case 'working':
      return 'working now';
    case 'waiting':
      return 'waiting for your answer';
    case 'done':
      return 'done';
    case 'failed':
      return 'failed';
    default:
      return 'not needed yet';
  }
}
