import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * What the conversation is busy with while a run is in progress and nothing has been said yet. Given to
 * {@link ChatActivityStyle.label} and to a custom `renderActivity`, so each can say it its own way.
 */
export interface ChatActivity {
  /** What the app says is going on ("Reading your files"), when it knows better than the stream does. */
  label?: string;
  /** The step of the run in progress, as the stream names it (a node id for a workflow): for apps that can turn it into words. */
  stepName?: string;
  /** The Team member taking its turn, when there is one. */
  memberEntityId?: string;
  memberName?: string;
}

/**
 * How the mark beside the text moves: `dots` (three dots lighting up one after the other), `pulse` (one mark breathing),
 * `spin` (one mark turning) or `none` (a still mark).
 */
export type ChatActivityAnimation = 'dots' | 'pulse' | 'spin' | 'none';

/** The look of the activity indicator. Everything is optional: what is left out comes from the stylesheet. */
export interface ChatActivityStyle {
  animation?: ChatActivityAnimation;
  /** The mark that pulses or spins, instead of the default dot or ring. Not used by `dots`. */
  icon?: ReactNode;
  /** The colour of the mark (any CSS colour). Defaults to the `--ag-chat-activity-color` variable, then the text colour. */
  color?: string;
  /** How long the run must have been busy before the indicator shows: a quick answer shows none at all. Default 300 ms. */
  delayMs?: number;
  /** The length of one cycle of the animation. Default 1200 ms. */
  periodMs?: number;
  /** What is said when nothing more is known. Default "Thinking…". */
  thinkingLabel?: string;
  /**
   * Turns what is going on into the text shown. Defaults to the app's own label, then "<member> is working on it…", then
   * {@link thinkingLabel}.
   */
  label?: (activity: ChatActivity) => string;
  /** False shows the mark alone. */
  showLabel?: boolean;
  className?: string;
}

export interface ChatActivityIndicatorProps {
  /** What is going on; `undefined` when nothing is. */
  activity: ChatActivity | undefined;
  style?: ChatActivityStyle;
  /** Draws the indicator instead of the default one; the delay and the disappearance still apply. */
  render?: (activity: ChatActivity) => ReactNode;
}

/** The text the default indicator shows for an activity, by the rules of {@link ChatActivityStyle.label}. */
export function chatActivityLabel(activity: ChatActivity, style: ChatActivityStyle = {}): string {
  if (style.label) return style.label(activity);
  const said = activity.label?.trim();
  if (said) return said;
  const member = (activity.memberName ?? activity.memberEntityId)?.trim();
  if (member) return `${member} is working on it…`;
  return style.thinkingLabel ?? 'Thinking…';
}

/**
 * A discreet "it is working" line: a small moving mark and a short text. It is shown while `activity` is set, after
 * {@link ChatActivityStyle.delayMs}, and gone the moment it is not. It holds no timer of its own beyond that delay: what it
 * shows is only ever what it is given. React port of the Flutter SDK's `AgUiChatActivityIndicator`.
 *
 * {@link ChatDiscussion} places it above the input on its own (`showActivityIndicator`); it is exported for layouts that put
 * it elsewhere. Motion stops for people who asked their system for less of it.
 */
export function ChatActivityIndicator({ activity, style = {}, render }: ChatActivityIndicatorProps) {
  const busy = activity !== undefined;
  const delayMs = style.delayMs ?? 300;
  const [due, setDue] = useState(busy && delayMs <= 0);

  // Only starting and stopping matter: a change of what is said while busy does not restart the delay.
  useEffect(() => {
    if (!busy) {
      setDue(false);
      return;
    }
    if (delayMs <= 0) {
      setDue(true);
      return;
    }
    const timer = setTimeout(() => setDue(true), delayMs);
    return () => clearTimeout(timer);
  }, [busy, delayMs]);

  if (!activity || !due) return null;
  if (render) return <>{render(activity)}</>;

  const animation = style.animation ?? 'dots';
  const text = chatActivityLabel(activity, style);
  const vars: Record<string, string> = {};
  if (style.color) vars['--ag-chat-activity-color'] = style.color;
  if (style.periodMs) vars['--ag-chat-activity-period'] = `${style.periodMs}ms`;

  return (
    <div className={cx('ag-chat-activity', `ag-chat-activity--${animation}`, style.className)} role="status" aria-live="polite" style={vars as CSSProperties}>
      <span className="ag-chat-activity__mark" aria-hidden="true">
        {animation === 'dots' ? (
          <>
            <span />
            <span />
            <span />
          </>
        ) : (
          (style.icon ?? <span className={animation === 'spin' ? 'ag-chat-activity__ring' : 'ag-chat-activity__dot'} />)
        )}
      </span>
      {style.showLabel === false ? <span className="ag-sr-only">{text}</span> : <span className="ag-chat-activity__text">{text}</span>}
    </div>
  );
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
