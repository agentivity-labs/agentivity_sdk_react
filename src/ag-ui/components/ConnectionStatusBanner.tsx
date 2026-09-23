import { useEffect, useState, type ReactNode } from 'react';
import type { AgUiConnectionState } from '../../protocol/sse-channel.js';

export interface ConnectionStatusBannerProps {
  state: AgUiConnectionState;
  /**
   * Overrides the default English copy — e.g. for localization. Receives the raw state
   * (including `attempt` and the live-computed `secondsLeft` until the next retry, when
   * known) and returns what to show; return `null` to suppress the banner for that state.
   */
  renderMessage?: (state: AgUiConnectionState, secondsLeft: number | undefined) => ReactNode;
  className?: string;
}

function defaultMessage(state: AgUiConnectionState, secondsLeft: number | undefined): ReactNode {
  if (state.status === 'connecting') return 'Connecting…';
  return `Connection lost — reconnecting (attempt ${state.attempt})${secondsLeft != null && secondsLeft > 0 ? ` in ${secondsLeft}s…` : '…'}`;
}

/**
 * Honest connection status for an AG-UI run stream (from {@link useRunStream}'s
 * `connectionState`) — replaces a generic "Something went wrong" with what's actually
 * happening: still connecting, reconnecting (with attempt count and a live countdown to
 * the next try), or done because the run finished. Renders nothing once actually
 * connected or terminated, so it never clutters the normal case.
 *
 * Unstyled by default (see the `.ag-connection-status*` rules in this package's
 * `styles.css` for the default look) — pass `className` or override those rules to
 * restyle, and `renderMessage` to localize the copy.
 */
export function ConnectionStatusBanner({ state, renderMessage, className }: ConnectionStatusBannerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.status !== 'reconnecting') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state.status]);

  if (state.status === 'connected' || state.status === 'terminated') return null;

  const secondsLeft = state.nextRetryAt != null ? Math.max(0, Math.ceil((state.nextRetryAt - now) / 1000)) : undefined;
  const message = (renderMessage ?? defaultMessage)(state, secondsLeft);
  if (message == null) return null;

  return (
    <p className={cx('ag-connection-status', `ag-connection-status--${state.status}`, className)}>
      <span className="ag-connection-status__dot" />
      {message}
    </p>
  );
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
