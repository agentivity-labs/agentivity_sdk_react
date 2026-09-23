import { useEffect, useRef, useState } from 'react';
import { AgUiSseChannel, type AgUiConnectionState } from '../protocol/sse-channel.js';
import { agUiEventParser, type AgUiEvent } from '../protocol/events.js';
import { useAgentivityClient } from './AgentivityProvider.js';

const INITIAL_CONNECTION_STATE: AgUiConnectionState = { status: 'connecting', attempt: 0 };

export interface UseRunStreamResult {
  /** All AG-UI events received on this stream so far, oldest first. */
  events: AgUiEvent[];
  /** The most recently received event, if any. */
  lastEvent: AgUiEvent | undefined;
  connected: boolean;
  /**
   * Structured connection status — use this instead of `connected` to show *why* the
   * stream isn't connected right now: still connecting, reconnecting (with attempt count
   * and the next retry time), or terminated because the run genuinely finished.
   */
  connectionState: AgUiConnectionState;
  /** Clears the accumulated `events` buffer without affecting the connection. */
  clear: () => void;
}

/**
 * Subscribes to an AG-UI SSE stream (e.g. a `SessionStartedResponse.streamUrl`)
 * and accumulates parsed events into React state. Reconnects automatically
 * (see {@link AgUiSseChannel}); call `markTerminated` semantics are handled by
 * watching for `RUN_FINISHED`/`RUN_ERROR` internally.
 *
 * ```tsx
 * const { events, connected } = useRunStream(session?.streamUrl);
 * ```
 */
export function useRunStream(streamPath: string | undefined): UseRunStreamResult {
  const client = useAgentivityClient();
  const [events, setEvents] = useState<AgUiEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<AgUiConnectionState>(INITIAL_CONNECTION_STATE);
  const channelRef = useRef<AgUiSseChannel<AgUiEvent> | null>(null);

  useEffect(() => {
    setEvents([]);
    setConnected(false);
    setConnectionState(INITIAL_CONNECTION_STATE);
    if (!streamPath) return;

    const channel = new AgUiSseChannel<AgUiEvent>({
      opener: (path, args) => client.runs.openEventStream(path, args),
      path: streamPath,
      parser: agUiEventParser,
    });
    channelRef.current = channel;

    const unsubscribeEvents = channel.subscribe((event) => {
      setEvents((prev) => [...prev, event]);
      // Only close the stream for terminal non-interrupt outcomes — a RUN_FINISHED with
      // outcome.kind === 'interrupt' means a HIL gate opened, not that the run is over.
      // Marking terminated here would permanently block reconnection for the rest of the
      // conversation on the very next disconnect, no matter how healthy the server is.
      if (event.type === 'RUN_ERROR' || (event.type === 'RUN_FINISHED' && event.outcome?.kind !== 'interrupt')) {
        channel.markTerminated();
      }
    });
    const unsubscribeConnected = channel.subscribeConnected(setConnected);
    const unsubscribeConnectionState = channel.subscribeConnectionState(setConnectionState);
    channel.start();

    return () => {
      unsubscribeEvents();
      unsubscribeConnected();
      unsubscribeConnectionState();
      channel.dispose();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamPath, client]);

  return {
    events,
    lastEvent: events.length > 0 ? events[events.length - 1] : undefined,
    connected,
    connectionState,
    clear: () => setEvents([]),
  };
}
