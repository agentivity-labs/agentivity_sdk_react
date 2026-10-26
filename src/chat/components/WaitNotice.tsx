import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { SlowCalls } from '../../client/slow-calls.js';

/** The words of `WaitNotice`, for an app to say them its way. Nothing in them speaks of a server or a workspace. */
export interface WaitTexts {
  title: string;
  detail: string;
  /** Said from `laterAfterMs` on. */
  later: string;
  /** Said from `longAfterMs` on, with `retry` when the app gives a way to try again. */
  long: string;
  retry: string;
  laterAfterMs: number;
  longAfterMs: number;
}

export const defaultWaitTexts: WaitTexts = {
  title: 'Just a moment…',
  detail: 'Getting things ready.',
  later: 'Almost there…',
  long: 'Taking a bit longer than usual.',
  retry: 'Try again',
  laterAfterMs: 15_000,
  longAfterMs: 60_000,
};

export interface WaitNoticeProps {
  /** Since when a call waits: `client.waiting`. */
  waiting: SlowCalls;
  texts?: Partial<WaitTexts>;
  /** Shown after `longAfterMs` when given: what trying again means is the app's. */
  onRetry?: () => void;
  className?: string;
}

/**
 * "Just a moment… Getting things ready." while a call waits for its answer (`client.waiting`): the first calls to a hosted workspace
 * that wakes up take most of a minute. No countdown (the wait is not known), a ring that turns, and words that change if it lasts.
 * Nothing shows while nothing waits. Mirrors the Flutter SDK's `AgUiWaitNotice`.
 */
export function WaitNotice({ waiting, texts, onRetry, className }: WaitNoticeProps) {
  const since = useSyncExternalStore(waiting.subscribe, waiting.getSnapshot);
  const [now, setNow] = useState(() => Date.now());
  const words = { ...defaultWaitTexts, ...texts };

  // The words change with the time waited: looked at again every second while something waits.
  useEffect(() => {
    if (since === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);

  if (since === undefined) return null;
  const waited = now - since;
  const long = waited >= words.longAfterMs;
  const detail = long ? words.long : waited >= words.laterAfterMs ? words.later : words.detail;

  return (
    <div className={['ag-wait', className].filter(Boolean).join(' ')} role="status" aria-live="polite">
      <span className="ag-wait__ring" aria-hidden="true" />
      <div className="ag-wait__body">
        <div className="ag-wait__title">{words.title}</div>
        <div className="ag-wait__detail" key={detail}>
          {detail}
        </div>
      </div>
      {long && onRetry && (
        <button type="button" className="ag-wait__retry" onClick={onRetry}>
          {words.retry}
        </button>
      )}
    </div>
  );
}

export interface WaitOverlayProps extends Omit<WaitNoticeProps, 'className'> {
  children?: ReactNode;
  /** Where the notice floats: at the top (default) or the bottom of what it wraps. */
  position?: 'top' | 'bottom';
}

/** What it wraps, with `WaitNotice` floating over it while a call waits, without stopping anyone from reading or typing. */
export function WaitOverlay({ children, position = 'top', ...notice }: WaitOverlayProps) {
  return (
    <div className="ag-wait-overlay">
      {children}
      <div className={`ag-wait-overlay__float ag-wait-overlay__float--${position}`}>
        <WaitNotice {...notice} />
      </div>
    </div>
  );
}
