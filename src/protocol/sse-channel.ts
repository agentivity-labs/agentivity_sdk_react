/**
 * Generic, reconnecting SSE channel — browser `fetch` + `ReadableStream` port of
 * the Flutter SDK's `AgUiSseChannel` (Dio-based). Same reconnect/backoff/watchdog
 * behavior, `AbortController` standing in for Dio's `CancelToken`.
 */

export interface AgUiSseOpenerArgs {
  lastEventId?: string;
  signal: AbortSignal;
}

/**
 * Opens a raw SSE HTTP response at `path`. The implementation is responsible for
 * setting the correct headers (`Accept: text/event-stream`, `Last-Event-ID` if provided).
 */
export type AgUiSseOpener = (path: string, args: AgUiSseOpenerArgs) => Promise<Response>;

/** Parses a raw SSE frame into a typed event `T`. Return `undefined` to silently discard it. */
export type AgUiSseParser<T> = (event: string, id: string | undefined, data: string | undefined) => T | undefined;

type Listener<T> = (event: T) => void;

/** Coarse connection status for {@link AgUiConnectionState}. */
export type AgUiConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'terminated';

/**
 * Structured connection status for a {@link AgUiSseChannel} — richer than the plain
 * connected/disconnected boolean, so a consumer can show *why* it's not connected right
 * now: still trying the first time ('connecting'), lost the connection and retrying on a
 * backoff schedule ('reconnecting', with the attempt count and the epoch-ms time of the
 * next try), or done for good because the run genuinely finished ('terminated').
 */
export interface AgUiConnectionState {
  status: AgUiConnectionStatus;
  /** Reconnect attempts made since the last successful connection. 0 while connected. */
  attempt: number;
  /** Epoch ms of the next scheduled retry — only set while status is 'reconnecting'. */
  nextRetryAt?: number;
}

const DEFAULT_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60_000;
const WATCHDOG_INTERVAL_MS = 15_000;
const INACTIVITY_TIMEOUT_MS = 45_000;
/** Reset backoff only if the connection was stable at least this long. */
const STABLE_THRESHOLD_MS = 30_000;

export class AgUiSseChannel<T> {
  private readonly opener: AgUiSseOpener;
  private readonly path: string;
  private readonly parser: AgUiSseParser<T>;

  private readonly listeners = new Set<Listener<T>>();
  private readonly connectedListeners = new Set<Listener<boolean>>();
  private readonly connectionStateListeners = new Set<Listener<AgUiConnectionState>>();
  private connected = false;
  private connectionState: AgUiConnectionState = { status: 'connecting', attempt: 0 };

  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastEventId: string | undefined;
  private lastActivityAt: number | null = null;
  private serverRetryDelayMs = DEFAULT_RETRY_DELAY_MS;
  private reconnectAttempts = 0;
  private connectedAt: number | null = null;
  private started = false;
  private disposed = false;
  /** Set when a terminal frame is received — suppresses reconnect. */
  private terminated = false;

  // Bound once so add/removeEventListener target the same reference.
  private readonly onVisibilityChange = (): void => this.onEnvironmentSignal('visibility');
  private readonly onOnline = (): void => this.onEnvironmentSignal('online');

  constructor(args: { opener: AgUiSseOpener; path: string; parser: AgUiSseParser<T> }) {
    this.opener = args.opener;
    this.path = args.path;
    this.parser = args.parser;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** Current structured connection state — see {@link AgUiConnectionState}. */
  get connectionStateSnapshot(): AgUiConnectionState {
    return this.connectionState;
  }

  /** Subscribe to parsed events. Returns an unsubscribe function. */
  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to connected/disconnected transitions. Returns an unsubscribe function. */
  subscribeConnected(listener: Listener<boolean>): () => void {
    this.connectedListeners.add(listener);
    return () => this.connectedListeners.delete(listener);
  }

  /**
   * Subscribe to structured connection state transitions (connecting/connected/reconnecting
   * with attempt count and next-retry time/terminated) — richer than {@link subscribeConnected}'s
   * plain boolean, for surfacing an honest "reconnecting, attempt 3, retrying in 12s" status
   * instead of a generic error. Returns an unsubscribe function.
   */
  subscribeConnectionState(listener: Listener<AgUiConnectionState>): () => void {
    this.connectionStateListeners.add(listener);
    return () => this.connectionStateListeners.delete(listener);
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.attachEnvironmentListeners();
    void this.connect();
  }

  dispose(): void {
    this.disposed = true;
    this.detachEnvironmentListeners();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
    this.setConnected(false);
    this.setConnectionState({ status: 'terminated', attempt: 0 });
    this.abortController?.abort();
    this.abortController = null;
    this.listeners.clear();
    this.connectedListeners.clear();
    this.connectionStateListeners.clear();
  }

  /**
   * Listens for signals that a backgrounded/asleep client can't otherwise notice in time:
   * the tab/app coming back to the foreground (mobile Safari/Chrome throttle or fully
   * suspend timers while backgrounded, so the watchdog may not fire for a long time after
   * the connection actually died) and the browser regaining network connectivity after a
   * real-world drop (a mobile network handoff, Wi-Fi/cellular switch, airplane mode toggle).
   * Either signal, while not already connected, jumps straight to a reconnect attempt
   * instead of waiting out whatever backoff delay is still pending — the whole point is a
   * transparent, immediate resume the moment the client is in a position to succeed again.
   */
  private attachEnvironmentListeners(): void {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibilityChange);
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
  }

  private detachEnvironmentListeners(): void {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
  }

  private onEnvironmentSignal(source: 'visibility' | 'online'): void {
    if (this.disposed || this.terminated) return;
    if (source === 'visibility' && (typeof document === 'undefined' || document.visibilityState !== 'visible')) return;

    if (this.connected) {
      // The stream may look connected but actually be stale: a backgrounded mobile tab can
      // have its fetch/ReadableStream silently suspended by the OS with no JS-visible error,
      // so `connected` never flipped false — only the watchdog's next tick would normally
      // catch this, up to WATCHDOG_INTERVAL_MS away (itself was likely throttled while
      // hidden). Check staleness immediately instead of waiting on that tick.
      const last = this.lastActivityAt;
      if (last == null || Date.now() - last < INACTIVITY_TIMEOUT_MS) return;
      if (typeof console !== 'undefined') {
        console.info(`AgUiSseChannel stale connection detected on ${this.path} (${source} signal) — reconnecting.`);
      }
      this.abortController?.abort();
      this.abortController = null;
      this.handleDisconnect();
      return;
    }

    if (typeof console !== 'undefined') {
      console.info(`AgUiSseChannel reconnecting now on ${this.path} (${source} signal).`);
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setConnectionState({ status: 'connecting', attempt: this.reconnectAttempts });
    void this.connect();
  }

  /**
   * Called by the consumer when a terminal AG-UI event (RUN_FINISHED, RUN_ERROR)
   * is received. Prevents the channel from reconnecting after a clean run end.
   */
  markTerminated(): void {
    this.terminated = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.setConnectionState({ status: 'terminated', attempt: 0 });
  }

  /** Resets the terminal flag — allows a new run to reconnect on the same channel. */
  resetTerminated(): void {
    this.terminated = false;
    this.reconnectAttempts = 0;
    this.setConnectionState({ status: 'connecting', attempt: 0 });
  }

  private setConnected(value: boolean): void {
    if (this.connected === value) return;
    this.connected = value;
    for (const listener of this.connectedListeners) listener(value);
  }

  private setConnectionState(state: AgUiConnectionState): void {
    this.connectionState = state;
    for (const listener of this.connectionStateListeners) listener(state);
  }

  private async connect(): Promise<void> {
    if (this.disposed) return;
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;

    try {
      const response = await this.opener(this.path, { lastEventId: this.lastEventId, signal: controller.signal });
      if (this.disposed || controller.signal.aborted) return;
      if (!response.ok || !response.body) {
        throw new Error(`SSE request to ${this.path} failed with status ${response.status}`);
      }

      this.connectedAt = Date.now();
      this.setConnected(true);
      this.setConnectionState({ status: 'connected', attempt: 0 });
      this.recordActivity();
      this.startWatchdog();

      const frameParser = new SseFrameParser((frame) => this.handleFrame(frame));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          this.recordActivity();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            frameParser.addLine(line.endsWith('\r') ? line.slice(0, -1) : line);
          }
        }
      } finally {
        frameParser.close();
      }

      if (!controller.signal.aborted) this.handleDisconnect();
    } catch (error) {
      if (this.disposed || controller.signal.aborted) return;
      if (typeof console !== 'undefined') {
        console.warn(`AgUiSseChannel error on ${this.path}:`, error);
      }
      this.handleDisconnect();
    }
  }

  private handleFrame(frame: SseFrame): void {
    this.recordActivity();
    if (frame.id && frame.id.trim().length > 0) {
      this.lastEventId = frame.id.trim();
    }
    if (frame.retryDelayMs != null) this.serverRetryDelayMs = frame.retryDelayMs;
    try {
      const parsed = this.parser(frame.event, frame.id, frame.data);
      if (parsed !== undefined) {
        for (const listener of this.listeners) listener(parsed);
      }
    } catch (error) {
      if (typeof console !== 'undefined') {
        console.warn(`AgUiSseChannel parser error on ${this.path}:`, error);
      }
    }
  }

  private handleDisconnect(): void {
    this.setConnected(false);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
    this.abortController = null;
    // Do not reconnect if the stream ended cleanly with a terminal event.
    if (this.disposed || this.terminated || this.reconnectTimer) return;
    const attemptNumber = this.reconnectAttempts + 1;
    const delay = this.computeReconnectDelay();
    this.setConnectionState({ status: 'reconnecting', attempt: attemptNumber, nextRetryAt: Date.now() + delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed && !this.terminated) {
        this.setConnectionState({ status: 'connecting', attempt: attemptNumber });
        void this.connect();
      }
    }, delay);
  }

  private recordActivity(): void {
    this.lastActivityAt = Date.now();
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      if (this.disposed) return;
      const last = this.lastActivityAt;
      if (last == null) return;
      if (Date.now() - last >= INACTIVITY_TIMEOUT_MS) {
        if (typeof console !== 'undefined') {
          console.warn(`AgUiSseChannel watchdog reconnect on ${this.path}.`);
        }
        this.abortController?.abort();
        this.abortController = null;
        this.handleDisconnect();
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  private computeReconnectDelay(): number {
    // Reset backoff only if the connection was stable long enough.
    // Transient connections (e.g. immediate disconnect) keep the counter growing.
    if (this.connectedAt != null && Date.now() - this.connectedAt >= STABLE_THRESHOLD_MS) {
      this.reconnectAttempts = 0;
    }
    this.connectedAt = null;

    const capped = Math.min(this.serverRetryDelayMs * 2 ** Math.min(this.reconnectAttempts, 5), MAX_RETRY_DELAY_MS);
    this.reconnectAttempts += 1;
    return capped + Math.floor(Math.random() * 750);
  }
}

// ── SSE frame parser (RFC 8895) ───────────────────────────────────────────────

interface SseFrame {
  event: string;
  data?: string;
  id?: string;
  retryDelayMs?: number;
}

class SseFrameParser {
  private readonly onFrame: (frame: SseFrame) => void;
  private dataLines: string[] = [];
  private event = 'message';
  private id: string | undefined;
  private retryDelayMs: number | undefined;
  private hasContent = false;

  constructor(onFrame: (frame: SseFrame) => void) {
    this.onFrame = onFrame;
  }

  addLine(line: string): void {
    if (line.length === 0) {
      this.dispatch();
      return;
    }
    if (line.startsWith(':')) return; // comment

    const sep = line.indexOf(':');
    const field = sep < 0 ? line : line.slice(0, sep);
    let value = sep < 0 ? '' : line.slice(sep + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    switch (field) {
      case 'event':
        this.event = value;
        this.hasContent = true;
        break;
      case 'data':
        this.dataLines.push(value);
        this.hasContent = true;
        break;
      case 'id':
        this.id = value;
        this.hasContent = true;
        break;
      case 'retry': {
        const ms = Number.parseInt(value, 10);
        if (!Number.isNaN(ms) && ms > 0) this.retryDelayMs = ms;
        this.hasContent = true;
        break;
      }
    }
  }

  close(): void {
    this.dispatch();
  }

  private dispatch(): void {
    if (!this.hasContent) return;
    this.onFrame({
      event: this.event,
      data: this.dataLines.length === 0 ? undefined : this.dataLines.join('\n'),
      id: this.id,
      retryDelayMs: this.retryDelayMs,
    });
    this.event = 'message';
    this.dataLines = [];
    this.id = undefined;
    this.retryDelayMs = undefined;
    this.hasContent = false;
  }
}
