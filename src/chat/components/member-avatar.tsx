/** Identity of a team member/agent whose turn is being rendered (active-member indicator or a message's speaker label). */
export interface AgUiChatMember {
  memberEntityId?: string;
  displayName?: string;
}

/**
 * What to render for a member's avatar. All fields optional — an app can supply
 * whichever it has (`imageUrl` wins if present, then `emoji`, then initials).
 * `color` styles the background when no `imageUrl` is given.
 */
export interface AgUiMemberAvatar {
  imageUrl?: string;
  emoji?: string;
  color?: string;
  initials?: string;
}

const DEFAULT_PALETTE = ['#E3A94F', '#F1633B', '#4F8C82', '#8B6B9C', '#3B7CF1', '#C9506B'];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Resolves the avatar for `member`: consults `resolver` first (an app-supplied mapping
 * from member identity to image/emoji/color), falling back to a deterministic
 * initials+color avatar derived from the member's id/name so a caller that configures
 * nothing still gets a stable, distinct-looking avatar per member.
 */
export function resolveMemberAvatar(member: AgUiChatMember, resolver?: (member: AgUiChatMember) => AgUiMemberAvatar | undefined): AgUiMemberAvatar {
  const resolved = resolver?.(member);
  const key = member.memberEntityId ?? member.displayName ?? '';
  const fallbackColor = DEFAULT_PALETTE[hashString(key) % DEFAULT_PALETTE.length];
  const fallbackInitials = initialsFrom(member.displayName ?? member.memberEntityId ?? '?');
  return {
    imageUrl: resolved?.imageUrl,
    emoji: resolved?.emoji,
    color: resolved?.color ?? fallbackColor,
    initials: resolved?.initials ?? fallbackInitials,
  };
}

/** Renders a small round avatar for `member` — image, then emoji, then initials on a colored circle. */
export function MemberAvatar({ member, resolver, className }: { member: AgUiChatMember; resolver?: (member: AgUiChatMember) => AgUiMemberAvatar | undefined; className?: string }) {
  const avatar = resolveMemberAvatar(member, resolver);
  if (avatar.imageUrl) {
    return <img src={avatar.imageUrl} alt={member.displayName ?? ''} className={cx('ag-chat-member-avatar', className)} />;
  }
  return (
    <span className={cx('ag-chat-member-avatar', className)} style={{ background: avatar.color }}>
      {avatar.emoji ?? avatar.initials}
    </span>
  );
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
