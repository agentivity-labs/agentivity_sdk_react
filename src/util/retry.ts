export interface RetryOptions {
  /** Max attempts beyond the first. Default 3 (4 attempts total). */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to fail fast instead of retrying (e.g. a 4xx that retrying can't fix). Default: always retryable. */
  isRetryable?: (error: unknown) => boolean;
  /** Called before each wait, e.g. to update a "retrying…" UI state. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  signal?: AbortSignal;
}

/**
 * Retries `fn` with exponential backoff on failure — for a critical one-shot call (start a
 * run, submit a reply, load data the user is waiting on) where a single transient blip
 * (a real-world network drop, a mobile network handoff, a momentary backend hiccup)
 * shouldn't surface as a hard failure. Not for streaming connections — see
 * {@link AgUiSseChannel} for that, which has its own reconnect/backoff and reacts to the
 * app regaining focus or network connectivity.
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const retries = options?.retries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1_000;
  const maxDelayMs = options?.maxDelayMs ?? 8_000;
  const isRetryable = options?.isRetryable ?? (() => true);

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || options?.signal?.aborted || !isRetryable(error)) throw error;
      const delayMs = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs) + Math.floor(Math.random() * 250);
      options?.onRetry?.(error, attempt + 1, delayMs);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      attempt += 1;
    }
  }
}
