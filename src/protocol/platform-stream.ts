import type { AgUiEvent } from './events.js';

/**
 * An out-of-band signal emitted by a platform adapter on the same transport
 * as AG-UI events — port of `PlatformSignal`.
 *
 * Platform signals carry platform-specific information (cache invalidation,
 * control commands, etc.) that is not part of the AG-UI protocol itself.
 * Consumers that only care about AG-UI events can ignore this stream entirely.
 * Platform adapters define their own signal shapes on top of this marker.
 */
export interface PlatformSignal {
  readonly kind: string;
}

type Unsubscribe = () => void;

/**
 * Generic interface for a live agent run stream that multiplexes AG-UI
 * protocol events and platform-specific signals on a single transport — port
 * of `PlatformStream`.
 *
 * Implementations connect to a specific backend (Agentivity, LangGraph, …)
 * and expose two separate subscription channels so consumers can subscribe
 * only to what they need.
 *
 * ```ts
 * const stream = connector.openStream(runId);
 * stream.subscribeEvents(chatController.feedEvent);
 * stream.subscribeSignals(onPlatformSignal);
 * stream.start();
 * // on cleanup:
 * stream.dispose();
 * ```
 */
export interface PlatformStream {
  /**
   * Subscribes to standard AG-UI protocol events emitted by this run. Route
   * to a `ChatController` via `feedEvent(event)` or any AG-UI-aware
   * controller. Cross-platform — consumers have no knowledge of SSE, HTTP, or
   * platform-specific wire formats.
   */
  subscribeEvents(listener: (event: AgUiEvent) => void): Unsubscribe;

  /**
   * Subscribes to platform-specific signals emitted alongside AG-UI events.
   * The concrete shape depends on the platform adapter in use — narrow with a
   * type guard on `signal.kind`. Platforms with no out-of-band signals never
   * call the listener.
   */
  subscribeSignals(listener: (signal: PlatformSignal) => void): Unsubscribe;

  /** Subscribes to connected/disconnected transitions. */
  subscribeConnected(listener: (connected: boolean) => void): Unsubscribe;

  /** Whether the underlying transport is currently connected. */
  readonly isConnected: boolean;

  /** Starts the transport. No-op after the first call. */
  start(): void;

  /** Terminates the transport and releases all resources. */
  dispose(): void;
}
