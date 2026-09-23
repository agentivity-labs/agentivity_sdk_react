import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

const EVENT_STYLE: Record<string, { color: string; icon: string; pulse: boolean }> = {
  success: { color: '#10b981', icon: '✓', pulse: false },
  error: { color: '#ef4444', icon: '✕', pulse: false },
  warning: { color: '#f59e0b', icon: '⚠', pulse: false },
  running: { color: 'var(--ag-primary, #2563eb)', icon: '●', pulse: true },
};
const DEFAULT_STYLE = { color: 'var(--ag-outline, #94a3b8)', icon: '○', pulse: false };

interface TimelineEvent {
  label: string;
  time: string;
  status?: string;
  note?: string;
}

function asEvents(raw: unknown): TimelineEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({
      label: e['label'] != null ? String(e['label']) : '',
      time: e['time'] != null ? String(e['time']) : '',
      status: typeof e['status'] === 'string' ? e['status'] : undefined,
      note: e['note'] != null ? String(e['note']) : undefined,
    }));
}

/**
 * Vertical event timeline — port of `AgTimeline`. Running-status dots pulse
 * via a CSS animation (`.ag-timeline__dot--pulse`, in the package's
 * `styles.css`) instead of a Flutter `AnimationController`.
 *
 * Agent props: `{ title, events: [{ label, time, status?, note? }] }`.
 */
export function Timeline({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Timeline';
  const events = asEvents(props['events']);

  return (
    <ArtifactCard title={title} type="Timeline">
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        const style = EVENT_STYLE[event.status ?? ''] ?? DEFAULT_STYLE;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ width: 28, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span className={style.pulse ? 'ag-timeline__dot ag-timeline__dot--pulse' : 'ag-timeline__dot'} style={{ color: style.color, fontSize: 16 }}>
                {style.icon}
              </span>
              {!isLast && <span style={{ flex: 1, width: 1.5, background: 'var(--ag-outline-variant, #e2e8f0)', opacity: 0.5 }} />}
            </div>
            <div style={{ width: 10 }} />
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{event.label}</span>
                {event.time && <span style={{ fontSize: 11, opacity: 0.45 }}>{event.time}</span>}
              </div>
              {event.note && <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{event.note}</div>}
            </div>
          </div>
        );
      })}
    </ArtifactCard>
  );
}
