import { useSyncExternalStore } from 'react';
import type { ChatController } from '../chat-controller.js';
import { MemberAvatar, type AgUiChatMember, type AgUiMemberAvatar } from './member-avatar.js';
import { groupColorOverrides, teamGroupColors, teamGroupKey } from './team-groups.js';
import { memberAvatarFor, teamMemberStatusText, type AgUiTeamMember } from './team-member.js';

export interface TeamRosterProps {
  controller: ChatController;
  /** Every member of the Team, in the order to show them. */
  members: AgUiTeamMember[];
  /** Maps a member's identity to an avatar (image/emoji/color). Falls back to initials+color when omitted. */
  resolveMemberAvatar?: (member: AgUiChatMember) => AgUiMemberAvatar | undefined;
  className?: string;
}

/**
 * A compact strip of the whole Team — one avatar per member, showing who is working now, who is
 * waiting on the user, who is done and who has not been needed yet. Driven by
 * {@link ChatController.memberStatuses}; optional and independent of `ChatDiscussion`, so it can
 * sit anywhere (under a header, in a sidebar). Small enough for a phone width.
 */
export function TeamRoster({ controller, members, resolveMemberAvatar, className }: TeamRosterProps) {
  const statuses = useSyncExternalStore(controller.subscribe, () => controller.memberStatuses);
  const groupColors = teamGroupColors(members.map((m) => m.group), groupColorOverrides(members));
  return (
    <div className={cx('ag-team-roster', className)} role="list" aria-label="Team">
      {members.map((member) => {
        const status = statuses.get(member.memberEntityId);
        const text = teamMemberStatusText(status);
        return (
          <div key={member.memberEntityId} role="listitem" className="ag-team-roster__member" data-status={status ?? 'idle'} title={`${member.displayName} — ${text}`}>
            <MemberAvatar member={member} resolver={memberAvatarFor(member, groupColors.get(teamGroupKey(member.group) ?? ''), resolveMemberAvatar)} className="ag-team-roster__avatar" />
            <span className="ag-team-roster__badge" aria-hidden="true" />
            <span className="ag-sr-only">
              {member.displayName}, {text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
