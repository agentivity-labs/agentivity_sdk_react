import type { PlatformSignal } from '../../protocol/platform-stream.js';

/**
 * Signals that one or more data topics need to be refreshed — port of
 * `AgentivitySyncSignal`.
 *
 * Emitted by the Agentivity SSE adapter for two frame types:
 * - `event: change` — carries a specific `topic`
 * - `event: sync_required` — `topic` is `undefined` (full resync)
 *
 * When `topic` is `undefined`, consumers should treat all state as stale.
 *
 * ```ts
 * stream.subscribeSignals((signal) => {
 *   if (isAgentivitySyncSignal(signal) && (signal.topic == null || signal.topic === AGENTIVITY_SYNC_TOPICS.execution)) {
 *     scheduleRefresh();
 *   }
 * });
 * ```
 */
export interface AgentivitySyncSignal extends PlatformSignal {
  kind: 'agentivity:sync';
  /** Affected topic, or `undefined` to indicate a full resync is needed. */
  topic?: string;
}

export function isAgentivitySyncSignal(signal: PlatformSignal): signal is AgentivitySyncSignal {
  return signal.kind === 'agentivity:sync';
}

/** Well-known topic values emitted by the Agentivity platform adapter. */
export const AGENTIVITY_SYNC_TOPICS = {
  chat: 'chat',
  forms: 'forms',
  interactions: 'interactions',
  execution: 'execution',
} as const;

/**
 * Translates Agentivity-specific SSE frames into {@link AgentivitySyncSignal}s
 * — port of `AgentivitySignalDecoder`.
 *
 * Injected into an `AgentivityRunStream` implementation at construction time
 * so it can be replaced in tests or extended with custom signal types.
 */
export interface AgentivitySignalDecoder {
  /**
   * Decodes an SSE frame. `sseEvent` is the raw `event:` field value (may be
   * empty for default message frames); `data` is the raw `data:` payload
   * string, or `undefined`.
   *
   * Returns a signal if the frame is a platform signal, or `undefined` if it
   * should be treated as a standard AG-UI protocol event.
   */
  decode(sseEvent: string, data: string | undefined): AgentivitySyncSignal | undefined;
}

/** Default decoder for the `change`/`sync_required` SSE frame convention described above. */
export const defaultAgentivitySignalDecoder: AgentivitySignalDecoder = {
  decode(sseEvent, data) {
    if (sseEvent === 'sync_required') return { kind: 'agentivity:sync', topic: undefined };
    if (sseEvent === 'change') {
      try {
        const parsed: unknown = data ? JSON.parse(data) : undefined;
        const topic = parsed && typeof parsed === 'object' && 'topic' in parsed ? String((parsed as Record<string, unknown>)['topic']) : undefined;
        return { kind: 'agentivity:sync', topic };
      } catch {
        return { kind: 'agentivity:sync', topic: undefined };
      }
    }
    return undefined;
  },
};
