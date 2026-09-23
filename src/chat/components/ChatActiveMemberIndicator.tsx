import { MemberAvatar, type AgUiChatMember, type AgUiMemberAvatar } from './member-avatar.js';

export interface ChatActiveMemberIndicatorProps {
  member: AgUiChatMember;
  /** Maps a member's identity to an avatar (image/emoji/color). Falls back to initials+color when omitted. */
  resolveMemberAvatar?: (member: AgUiChatMember) => AgUiMemberAvatar | undefined;
  /** Text shown next to the member's name, e.g. "is working on it…". Defaults to a generic phrase. */
  label?: string;
  className?: string;
}

/**
 * "Team member at work" indicator (Option A) — an avatar, the active member's name, and an
 * animated ellipsis. Optional, opt-in via {@link ChatDiscussionProps.showActiveMemberIndicator}.
 * Rendered only while {@link ChatController.activeMember} is set — i.e. only during a Team
 * conversation where the backend reports which member is currently taking its turn; a
 * standalone Agent run never sets this, so the indicator never appears for it.
 */
export function ChatActiveMemberIndicator({ member, resolveMemberAvatar, label = 'is working on it', className }: ChatActiveMemberIndicatorProps) {
  return (
    <div className={cx('ag-chat-active-member', className)}>
      <MemberAvatar member={member} resolver={resolveMemberAvatar} className="ag-chat-active-member__avatar" />
      <span className="ag-chat-active-member__text">
        <span className="ag-chat-active-member__name">{member.displayName ?? member.memberEntityId}</span> {label}
        <span className="ag-chat-active-member__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </span>
    </div>
  );
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
