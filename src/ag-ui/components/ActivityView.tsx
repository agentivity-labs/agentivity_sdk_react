import { useSyncExternalStore, type ReactNode } from 'react';
import type { AgUiActivityController } from '../agent/activity-controller.js';
import { activityDescription, activityLabel, activityProgress, type AgUiActivity } from '../agent/activity-controller.js';

export interface ActivityViewProps {
  controller: AgUiActivityController;
  /** Custom renderer — return any node for the current activity. */
  builder?: (activity: AgUiActivity) => ReactNode;
  className?: string;
}

/**
 * Displays the current agent activity from {@link AgUiActivityController} —
 * port of `AgUiActivityView`. Renders nothing when there is no current
 * activity.
 */
export function ActivityView({ controller, builder, className }: ActivityViewProps) {
  const current = useSyncExternalStore(controller.subscribe, () => controller.current);
  if (!current) return null;
  if (builder) return <>{builder(current)}</>;
  return <DefaultActivityRow activity={current} className={className} />;
}

function DefaultActivityRow({ activity, className }: { activity: AgUiActivity; className?: string }) {
  const desc = activityDescription(activity);
  const progress = activityProgress(activity);

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--ag-surface-container-low, #f8fafc)' }}>
      <Spinner progress={progress} />
      <div>
        <div style={{ fontSize: 12 }}>{activityLabel(activity)}</div>
        {desc && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{desc}</div>}
      </div>
    </div>
  );
}

function Spinner({ progress }: { progress?: number }) {
  if (progress != null) {
    return (
      <svg width={16} height={16} viewBox="0 0 16 16">
        <circle cx={8} cy={8} r={6} fill="none" stroke="var(--ag-outline-variant, #e2e8f0)" strokeWidth={2} />
        <circle
          cx={8}
          cy={8}
          r={6}
          fill="none"
          stroke="var(--ag-primary, #2563eb)"
          strokeWidth={2}
          strokeDasharray={2 * Math.PI * 6}
          strokeDashoffset={2 * Math.PI * 6 * (1 - progress)}
          transform="rotate(-90 8 8)"
        />
      </svg>
    );
  }
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" style={{ animation: 'ag-spin 0.8s linear infinite' }}>
      <circle cx={8} cy={8} r={6} fill="none" stroke="var(--ag-primary, #2563eb)" strokeWidth={2} strokeDasharray="28 20" />
    </svg>
  );
}
