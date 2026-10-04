import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ConnectionMonitor, ConnectionState } from '../../client/connection-monitor.js';

export interface ChatConnectionNoticeProps {
  /** The client's connection monitor (`client.connection`). */
  monitor: ConnectionMonitor;
  className?: string;
}

/** How long "Connection restored" stays up after the server is back. */
const RESTORED_MS = 3_000;

/** The words for each state, shared with any app that wants to word it itself. */
export function describeConnection(state: ConnectionState, now: number): { title: string; detail: string; secondsLeft?: number } | undefined {
  if (state.status === 'offline') {
    const secondsLeft = state.nextRetryAt !== undefined ? Math.max(0, Math.ceil((state.nextRetryAt - now) / 1000)) : undefined;
    const detail = state.retrying || secondsLeft === 0 ? 'Trying to reconnect…' : secondsLeft !== undefined ? `Reconnecting automatically — next attempt in ${secondsLeft} s.` : 'Reconnecting automatically…';
    return { title: "Can't reach the server", detail, secondsLeft };
  }
  if (state.recoveredAt !== undefined && now - state.recoveredAt < RESTORED_MS) return { title: 'Connection restored', detail: 'You are back online.' };
  return undefined;
}

/**
 * Says plainly that the server cannot be reached — and that the app is already trying again, with a countdown to the next attempt
 * and a "Retry now" button — instead of leaving a conversation that just looks stuck. Shown by `ChatDiscussion` on its own when it
 * sits inside an `AgentivityProvider`; any other screen can render it with `client.connection`.
 */
export function ChatConnectionNotice({ monitor, className }: ChatConnectionNoticeProps) {
  const state = useSyncExternalStore(monitor.subscribe, monitor.getSnapshot);
  const [now, setNow] = useState(() => Date.now());

  // Ticks once a second while there is something to count down or a "restored" message to retire.
  const active = state.status === 'offline' || (state.recoveredAt !== undefined && Date.now() - state.recoveredAt < RESTORED_MS);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, state.recoveredAt, state.status]);

  const text = describeConnection(state, now);
  if (!text) return null;
  const offline = state.status === 'offline';

  return (
    <div className={['ag-chat-connection', className].filter(Boolean).join(' ')} role="status" aria-live="polite" data-status={state.status}>
      <div className="ag-chat-connection__body">
        <div className="ag-chat-connection__title">{text.title}</div>
        <div className="ag-chat-connection__detail">
          {text.detail}
          {offline && state.attempt > 0 && <span className="ag-chat-connection__attempt"> (attempt {state.attempt})</span>}
        </div>
        {offline && state.reason && <div className="ag-chat-connection__reason">{state.reason}</div>}
      </div>
      {offline && (
        <button type="button" className="ag-chat-connection__retry" onClick={() => monitor.retryNow()} disabled={state.retrying}>
          Retry now
        </button>
      )}
    </div>
  );
}
