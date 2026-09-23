import { ArtifactCard } from '../ArtifactCard.js';
import { withAlpha } from '../../color-utils.js';
import type { ChartProps } from '../charts/BarChart.js';

const STATUS_STYLE: Record<string, { color: string; icon: string; label: string }> = {
  success: { color: '#10b981', icon: '✓', label: 'Success' },
  warning: { color: '#f59e0b', icon: '⚠', label: 'Warning' },
  error: { color: '#ef4444', icon: '✕', label: 'Error' },
};
const DEFAULT_STYLE = { color: 'var(--ag-primary, #2563eb)', icon: 'ⓘ', label: 'Info' };

/**
 * Status/alert card (success, warning, error, info) — port of `AgStatusCard`.
 *
 * Agent props: `{ title, status?: 'success'|'warning'|'error'|'info', message, details? }`.
 */
export function StatusCard({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Status';
  const status = typeof props['status'] === 'string' ? props['status'] : 'info';
  const message = props['message'] != null ? String(props['message']) : '';
  const details = Array.isArray(props['details']) ? (props['details'] as unknown[]).map(String) : [];
  const style = STATUS_STYLE[status] ?? DEFAULT_STYLE;

  return (
    <ArtifactCard title={title} type={style.label}>
      <div
        style={{
          background: withAlpha(style.color, 0.08),
          border: `1px solid ${withAlpha(style.color, 0.25)}`,
          borderRadius: 6,
          padding: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: style.color, fontSize: 16, lineHeight: 1 }}>{style.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{message}</span>
        </div>
        {details.length > 0 && (
          <div style={{ marginTop: 8, paddingLeft: 24 }}>
            {details.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 0, fontSize: 11, marginTop: 3 }}>
                <span style={{ opacity: 0.5 }}>• </span>
                <span style={{ opacity: 0.7 }}>{d}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ArtifactCard>
  );
}
