/**
 * Since when a call has been waiting for its answer longer than `afterMs` (epoch ms), or undefined when none is: what an app shows
 * as "Just a moment…" (`WaitNotice`). A hosted workspace that sleeps holds the first calls while it starts, often for most of a
 * minute; a call that is long by itself waits the same. A call is followed whole, the times it is asked again included; a live
 * stream is not followed. Mirrors the Flutter SDK's `SlowCalls`.
 */
export class SlowCalls {
  private readonly listeners = new Set<() => void>();
  private readonly slow = new Map<object, number>();
  private since: number | undefined;

  constructor(readonly afterMs = 3_000) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): number | undefined => this.since;

  /** Runs `call`, counted while it waits past `afterMs`. */
  async follow<T>(call: () => Promise<T>): Promise<T> {
    const id = {};
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      this.slow.set(id, startedAt);
      this.recompute();
    }, this.afterMs);
    try {
      return await call();
    } finally {
      clearTimeout(timer);
      if (this.slow.delete(id)) this.recompute();
    }
  }

  private recompute(): void {
    this.since = this.slow.size === 0 ? undefined : Math.min(...this.slow.values());
    for (const listener of this.listeners) listener();
  }
}
