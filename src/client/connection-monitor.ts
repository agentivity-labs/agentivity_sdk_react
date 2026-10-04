/**
 * Whether the app can reach the Agentivity server, and when it will try again. The one place the SDK keeps that answer — fed by
 * the HTTP transport (a request that never got an answer) and by the live streams (a stream that dropped and is reconnecting) —
 * so every component can say so plainly ("can't reach the server, trying again in 12 s") instead of looking stuck.
 *
 * While the HTTP side is unreachable the monitor probes the server itself, on a growing delay, and clears as soon as any answer
 * comes back. Streams reconnect on their own schedule; they report it here and can be told to retry at once.
 */
export interface ConnectionState {
  status: 'online' | 'offline';
  /** Attempts made since the connection was lost (0 while online). */
  attempt: number;
  /** Epoch ms of the next automatic attempt — undefined while one is under way, or while online. */
  nextRetryAt?: number;
  /** An attempt is under way right now. */
  retrying: boolean;
  /** Epoch ms the connection was lost. */
  since?: number;
  /** What failed, as the transport reported it (for the details line). */
  reason?: string;
  /** Epoch ms the connection came back — set for a few seconds so a notice can say "back online". */
  recoveredAt?: number;
}

interface Source {
  since: number;
  attempt: number;
  nextRetryAt?: number;
  retrying: boolean;
  reason?: string;
  retry?: () => void;
}

/** What a live stream tells the monitor about itself. */
export interface StreamConnection {
  offline: boolean;
  attempt: number;
  nextRetryAt?: number;
  reason?: string;
  /** Reconnects the stream now instead of waiting for its schedule. */
  retry?: () => void;
}

export interface ConnectionMonitorOptions {
  /** Asks the server for anything: true when ANY answer came back (even an error status), false when it could not be reached. */
  probe?: () => Promise<boolean>;
  /** Delays between probes while unreachable, in ms; the last one repeats. */
  delays?: number[];
  now?: () => number;
}

const DEFAULT_DELAYS = [3_000, 5_000, 8_000, 12_000, 20_000, 30_000];
const HTTP = 'http';

export class ConnectionMonitor {
  private readonly sources = new Map<string, Source>();
  private readonly listeners = new Set<() => void>();
  private state: ConnectionState = { status: 'online', attempt: 0, retrying: false };
  private probeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly probe?: () => Promise<boolean>;
  private readonly delays: number[];
  private readonly now: () => number;

  constructor(options: ConnectionMonitorOptions = {}) {
    this.probe = options.probe;
    this.delays = options.delays?.length ? options.delays : DEFAULT_DELAYS;
    this.now = options.now ?? Date.now;
  }

  /** `useSyncExternalStore`-ready. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ConnectionState => this.state;

  /** A request got no answer at all (server down, network lost, DNS, timeout…). */
  httpFailed(reason?: string): void {
    const existing = this.sources.get(HTTP);
    if (existing) {
      if (reason) existing.reason = reason;
      return;
    }
    this.sources.set(HTTP, { since: this.now(), attempt: 0, retrying: false, reason, retry: () => void this.runProbe() });
    this.scheduleProbe();
    this.recompute();
  }

  /** The server answered something — it is reachable. */
  httpReachable(): void {
    if (!this.sources.delete(HTTP)) return;
    this.clearProbe();
    this.recompute();
  }

  /** A live stream's state: offline while it is reconnecting, online once it is connected again (or has ended for good). */
  setStream(id: string, stream: StreamConnection): void {
    if (!stream.offline) {
      if (this.sources.delete(`stream:${id}`)) this.recompute();
      return;
    }
    const previous = this.sources.get(`stream:${id}`);
    this.sources.set(`stream:${id}`, {
      since: previous?.since ?? this.now(),
      attempt: stream.attempt,
      nextRetryAt: stream.nextRetryAt,
      retrying: stream.nextRetryAt === undefined,
      reason: stream.reason,
      retry: stream.retry,
    });
    this.recompute();
  }

  /** Forgets a stream (it was closed). */
  removeStream(id: string): void {
    if (this.sources.delete(`stream:${id}`)) this.recompute();
  }

  /** The user asked to try again now: every unreachable source is retried at once. */
  retryNow(): void {
    for (const source of [...this.sources.values()]) source.retry?.();
  }

  /** Stops the probe timer. */
  dispose(): void {
    this.clearProbe();
    this.listeners.clear();
  }

  // ── probing ──────────────────────────────────────────────────────────────────────────────────

  private scheduleProbe(): void {
    const source = this.sources.get(HTTP);
    if (!source || !this.probe) return;
    this.clearProbe();
    const delay = this.delays[Math.min(source.attempt, this.delays.length - 1)]!;
    source.nextRetryAt = this.now() + delay;
    source.retrying = false;
    this.probeTimer = setTimeout(() => void this.runProbe(), delay);
  }

  private async runProbe(): Promise<void> {
    const source = this.sources.get(HTTP);
    if (!source || !this.probe || source.retrying) return;
    this.clearProbe();
    source.retrying = true;
    source.nextRetryAt = undefined;
    source.attempt += 1;
    this.recompute();

    let reachable = false;
    try {
      reachable = await this.probe();
    } catch {
      reachable = false;
    }

    const current = this.sources.get(HTTP);
    if (!current) return;
    if (reachable) {
      this.httpReachable();
    } else {
      current.retrying = false;
      this.scheduleProbe();
      this.recompute();
    }
  }

  private clearProbe(): void {
    if (this.probeTimer) clearTimeout(this.probeTimer);
    this.probeTimer = undefined;
  }

  // ── state ────────────────────────────────────────────────────────────────────────────────────

  private recompute(): void {
    const previous = this.state;
    if (this.sources.size === 0) {
      this.state = previous.status === 'offline' ? { status: 'online', attempt: 0, retrying: false, recoveredAt: this.now() } : { ...previous, status: 'online', attempt: 0, retrying: false };
    } else {
      const all = [...this.sources.values()];
      const waiting = all.map((s) => s.nextRetryAt).filter((t): t is number => t !== undefined);
      this.state = {
        status: 'offline',
        attempt: Math.max(...all.map((s) => s.attempt)),
        nextRetryAt: waiting.length > 0 ? Math.min(...waiting) : undefined,
        retrying: all.some((s) => s.retrying),
        since: Math.min(...all.map((s) => s.since)),
        reason: all.find((s) => s.reason)?.reason,
      };
    }
    for (const listener of this.listeners) listener();
  }
}
