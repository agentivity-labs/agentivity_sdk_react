import { AgUiSseChannel, type AgUiSseOpener, type AgUiSseParser } from '../../protocol/sse-channel.js';
import { parseAgUiEvent, type AgUiEvent } from '../../protocol/events.js';
import type { PlatformSignal, PlatformStream } from '../../protocol/platform-stream.js';
import { defaultAgentivitySignalDecoder, type AgentivitySignalDecoder } from './agentivity-signals.js';

type Frame = { kind: 'protocol'; event: AgUiEvent } | { kind: 'signal'; signal: PlatformSignal };

function parseFrame(event: string, _id: string | undefined, data: string | undefined, decoder: AgentivitySignalDecoder): Frame | undefined {
  const normalized = event.trim() || 'message';

  const signal = decoder.decode(normalized, data);
  if (signal) return { kind: 'signal', signal };

  // Standard AG-UI JSON frame.
  const raw = data?.trim();
  if (!raw) return undefined;
  try {
    const decoded: unknown = JSON.parse(raw);
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      // Mirror agUiEventParser: if the JSON has no 'type' field, use the SSE
      // event name as the discriminator so backends that use SSE event names
      // (e.g. `event: CUSTOM`) instead of a JSON 'type' field work too.
      const json = decoded as Record<string, unknown>;
      if (!('type' in json) && normalized !== 'message') json['type'] = normalized;
      return { kind: 'protocol', event: parseAgUiEvent(json) };
    }
  } catch {
    if (typeof console !== 'undefined') console.warn(`AgentivityRunStream: failed to parse frame (event=${normalized}, data=${raw})`);
  }
  return undefined;
}

type Listener<T> = (value: T) => void;

/**
 * Agentivity-platform {@link PlatformStream} adapter — port of
 * `AgentivityRunStream`.
 *
 * The Agentivity SSE transport emits three kinds of frames on the same
 * connection:
 *
 * | SSE `event` field | Meaning                          | Routed to           |
 * |--------------------|-----------------------------------|---------------------|
 * | `change`           | Platform change notification      | signals             |
 * | `sync_required`    | Full-resync requested by backend  | signals             |
 * | anything else      | Standard AG-UI protocol event     | AG-UI events        |
 *
 * The underlying {@link AgUiSseChannel} handles reconnection with exponential
 * backoff, a watchdog timer, and `Last-Event-ID` resume. AG-UI events are
 * replayed to late subscribers (e.g. a `ChatController` created after the tab
 * opens) — transparent to consumers, no backend cooperation needed.
 *
 * ```ts
 * const stream = AgentivityRunStream.forRun({ opener: apiClient.openEventStream, runId });
 * stream.subscribeEvents(chatController.feedEvent);
 * stream.subscribeSignals((s) => isAgentivitySyncSignal(s) && onSync(s));
 * stream.start();
 * ```
 */
export class AgentivityRunStream implements PlatformStream {
  private readonly channel: AgUiSseChannel<Frame>;
  private readonly eventBuffer: AgUiEvent[] = [];
  private eventsDone = false;
  private readonly eventListeners = new Set<Listener<AgUiEvent>>();
  private readonly signalListeners = new Set<Listener<PlatformSignal>>();
  private readonly connectedListeners = new Set<Listener<boolean>>();

  constructor(args: { opener: AgUiSseOpener; path: string; decoder?: AgentivitySignalDecoder }) {
    const decoder = args.decoder ?? defaultAgentivitySignalDecoder;
    const parser: AgUiSseParser<Frame> = (event, id, data) => parseFrame(event, id, data, decoder);
    this.channel = new AgUiSseChannel<Frame>({ opener: args.opener, path: args.path, parser });

    this.channel.subscribe((frame) => {
      if (frame.kind === 'protocol') {
        this.eventBuffer.push(frame.event);
        for (const listener of this.eventListeners) listener(frame.event);
        // Mark the channel as terminated on clean run end so it does not
        // reconnect and re-deliver RUN_STARTED (which would reset isAwaitingResponse).
        // A RUN_FINISHED with outcome.kind === 'interrupt' means a HIL gate opened, not
        // that the run is over — terminating here would permanently block reconnection
        // on the next disconnect, however healthy the server is.
        if (frame.event.type === 'RUN_ERROR' || (frame.event.type === 'RUN_FINISHED' && frame.event.outcome?.kind !== 'interrupt')) {
          this.channel.markTerminated();
        }
      } else {
        for (const listener of this.signalListeners) listener(frame.signal);
      }
    });
    this.channel.subscribeConnected((connected) => {
      for (const listener of this.connectedListeners) listener(connected);
    });
  }

  /** Stream for a single agent run (`/api/v1/streams/runs/{runId}/events`). */
  static forRun(args: { opener: AgUiSseOpener; runId: string; decoder?: AgentivitySignalDecoder }): AgentivityRunStream {
    return new AgentivityRunStream({ opener: args.opener, path: `/api/v1/streams/runs/${args.runId.trim()}/events`, decoder: args.decoder });
  }

  /** Execution-level stream aggregating all runs in an execution chain. */
  static forExecution(args: { opener: AgUiSseOpener; executionId: string; decoder?: AgentivitySignalDecoder }): AgentivityRunStream {
    return new AgentivityRunStream({ opener: args.opener, path: `/api/v1/streams/runs/executions/${args.executionId.trim()}/events`, decoder: args.decoder });
  }

  /** Workspace-level collection stream covering all runs (`/api/v1/streams/runs/events`). */
  static forCollection(args: { opener: AgUiSseOpener; decoder?: AgentivitySignalDecoder }): AgentivityRunStream {
    return new AgentivityRunStream({ opener: args.opener, path: '/api/v1/streams/runs/events', decoder: args.decoder });
  }

  /** Subscribes to AG-UI events. Buffered past events replay synchronously to the new subscriber. */
  subscribeEvents(listener: (event: AgUiEvent) => void): () => void {
    for (const event of this.eventBuffer) listener(event);
    if (this.eventsDone) return () => {};
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  subscribeSignals(listener: (signal: PlatformSignal) => void): () => void {
    this.signalListeners.add(listener);
    return () => this.signalListeners.delete(listener);
  }

  subscribeConnected(listener: (connected: boolean) => void): () => void {
    this.connectedListeners.add(listener);
    return () => this.connectedListeners.delete(listener);
  }

  get isConnected(): boolean {
    return this.channel.isConnected;
  }

  start(): void {
    this.channel.start();
  }

  dispose(): void {
    this.eventsDone = true;
    this.channel.dispose();
    this.eventListeners.clear();
    this.signalListeners.clear();
    this.connectedListeners.clear();
  }
}
