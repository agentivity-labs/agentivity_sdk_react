import type { AgUiEvent } from '../../protocol/events.js';
import { applyJsonPatch } from '../../shared/json-patch.js';

/**
 * A single agent activity received via `ACTIVITY_SNAPSHOT`/`ACTIVITY_DELTA` —
 * represents what the agent is currently doing (e.g. "Searching the web…").
 * Port of `AgUiActivity`.
 */
export interface AgUiActivity {
  messageId: string;
  /** Categorical type set by the agent (e.g. `"search"`, `"read"`, `"think"`). */
  activityType: string;
  /** Free-form content map — see {@link activityLabel}/{@link activityDescription}/{@link activityProgress}. */
  content: Record<string, unknown>;
}

/** Short display label, or falls back to `activityType`. */
export function activityLabel(a: AgUiActivity): string {
  return a.content['label'] != null ? String(a.content['label']) : a.activityType;
}

/** Longer human-readable description, if provided. */
export function activityDescription(a: AgUiActivity): string | undefined {
  return a.content['description'] != null ? String(a.content['description']) : undefined;
}

/** Progress value in [0, 1], or `undefined` for indeterminate. */
export function activityProgress(a: AgUiActivity): number | undefined {
  const v = a.content['progress'];
  return typeof v === 'number' ? Math.min(1, Math.max(0, v)) : undefined;
}

function patchActivity(a: AgUiActivity, ops: unknown[]): AgUiActivity {
  return { messageId: a.messageId, activityType: a.activityType, content: applyJsonPatch(a.content, ops) };
}

type Listener = () => void;

/**
 * Consumes `ACTIVITY_SNAPSHOT`/`ACTIVITY_DELTA` events from an AG-UI event
 * stream and exposes the live set of agent activities — port of
 * `AgUiActivityController`.
 *
 * Activities are cleared automatically when `RUN_FINISHED`/`RUN_ERROR` arrives.
 *
 * ```ts
 * const activity = new AgUiActivityController();
 * events.forEach(activity.feedEvent);
 * ```
 */
export class AgUiActivityController {
  private readonly activitiesByMessageId = new Map<string, AgUiActivity>();
  private readonly listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** All active activities, in insertion order. */
  get activities(): AgUiActivity[] {
    return [...this.activitiesByMessageId.values()];
  }

  /** The most recent activity, or `undefined` when idle. */
  get current(): AgUiActivity | undefined {
    const values = [...this.activitiesByMessageId.values()];
    return values.length > 0 ? values[values.length - 1] : undefined;
  }

  get hasActivity(): boolean {
    return this.activitiesByMessageId.size > 0;
  }

  feedEvent = (event: AgUiEvent): void => {
    switch (event.type) {
      case 'ACTIVITY_SNAPSHOT':
        if (event.replace || !this.activitiesByMessageId.has(event.messageId)) {
          this.activitiesByMessageId.set(event.messageId, { messageId: event.messageId, activityType: event.activityType, content: { ...event.content } });
          this.notify();
        }
        break;

      case 'ACTIVITY_DELTA': {
        const existing = this.activitiesByMessageId.get(event.messageId);
        if (existing && event.patch.length > 0) {
          this.activitiesByMessageId.set(event.messageId, patchActivity(existing, event.patch));
          this.notify();
        }
        break;
      }

      case 'RUN_FINISHED':
      case 'RUN_ERROR':
        if (this.activitiesByMessageId.size > 0) {
          this.activitiesByMessageId.clear();
          this.notify();
        }
        break;

      default:
        break;
    }
  };
}
