import type { TeamStructure } from '../../client/domain/team-definition-models.js';
import { teamManager } from '../../client/domain/team-definition-models.js';
import type { AgUiChatMember, AgUiMemberAvatar } from './member-avatar.js';
import type { IconRef } from '../../icons/icon-ref.js';
import type { TeamMemberStatus } from '../chat-controller.js';
import { groupColorOverrides, teamGroupColors, teamGroupKey } from './team-groups.js';

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
}

/** A team's saved definition, ready for `TeamRoster` / `TeamGraph`: one member each, with the icon and group the team editor set. */
export function teamMembersFromStructure(team: TeamStructure): AgUiTeamMember[] {
  return team.members.map((m) => ({ memberEntityId: m.memberEntityId, displayName: m.displayName ?? m.memberEntityId, icon: m.icon, group: m.group, groupColor: team.groupColors[teamGroupKey(m.group) ?? ''] }));
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
