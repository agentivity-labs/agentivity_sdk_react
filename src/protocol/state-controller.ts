import type { AgUiEvent } from './events.js';
import { applyJsonPatch } from '../shared/json-patch.js';

type Listener = () => void;

/**
 * Tracks agent state from `STATE_SNAPSHOT`/`STATE_DELTA` events — port of
 * `AgUiStateController`. Feed it events from {@link useRunStream} or any other
 * AG-UI event source via {@link AgUiStateController.feedEvent}.
 *
 * ```ts
 * const stateController = useMemo(() => new AgUiStateController(), []);
 * const { events } = useRunStream(streamUrl);
 * useEffect(() => { events.forEach(stateController.feedEvent); }, [events, stateController]);
 * ```
 */
export class AgUiStateController {
  private stateValue: Record<string, unknown> = {};
  private readonly listeners = new Set<Listener>();

  /** The current agent state. Replaced on `STATE_SNAPSHOT`, patched on `STATE_DELTA`. */
  get state(): Record<string, unknown> {
    return this.stateValue;
  }

  /** Convenience accessor for a single top-level key. */
  get(key: string): unknown {
    return this.stateValue[key];
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  feedEvent = (event: AgUiEvent): void => {
    if (event.type === 'STATE_SNAPSHOT') {
      const s = event.snapshot;
      this.stateValue = s && typeof s === 'object' && !Array.isArray(s) ? { ...(s as Record<string, unknown>) } : {};
      this.notify();
    } else if (event.type === 'STATE_DELTA') {
      if (event.delta.length > 0) {
        this.stateValue = applyJsonPatch(this.stateValue, event.delta);
        this.notify();
      }
    }
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
