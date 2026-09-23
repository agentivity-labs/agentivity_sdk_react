import { ArtifactCard } from '../ArtifactCard.js';
import { useArtifactsTheme } from '../../../react/ArtifactsThemeProvider.js';
import { effectiveValueFontSize } from '../../theme.js';
import type { ChartProps } from '../charts/BarChart.js';

/**
 * Single KPI metric card — port of `AgMetricCard`.
 *
 * Agent props: `{ title, value, delta?, trend?: 'up'|'down'|'flat', subtitle? }`.
 */
export function MetricCard({ props }: ChartProps) {
  const theme = useArtifactsTheme();
  const title = typeof props['title'] === 'string' ? props['title'] : 'Metric';
  const value = props['value'] != null ? String(props['value']) : '—';
  const delta = typeof props['delta'] === 'string' ? props['delta'] : undefined;
  const trend = typeof props['trend'] === 'string' ? props['trend'] : undefined;
  const subtitle = typeof props['subtitle'] === 'string' ? props['subtitle'] : undefined;

  let trendColor = 'currentColor';
  let trendOpacity = 0.5;
  let trendArrow = '–';
  if (trend === 'up') {
    trendColor = '#10b981';
    trendOpacity = 1;
    trendArrow = '↑';
  } else if (trend === 'down') {
    trendColor = '#ef4444';
    trendOpacity = 1;
    trendArrow = '↓';
  }

  return (
    <ArtifactCard title={title} type="Metric">
      <div style={{ fontSize: effectiveValueFontSize(theme), fontWeight: 700, letterSpacing: -0.5 }}>{value}</div>
      {(delta != null || subtitle != null) && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 6, gap: 3 }}>
          {delta != null && (
            <>
              <span style={{ color: trendColor, opacity: trendOpacity, fontSize: 13 }}>{trendArrow}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: trendColor, opacity: trendOpacity }}>{delta}</span>
              {subtitle != null && <span style={{ width: 6 }} />}
            </>
          )}
          {subtitle != null && <span style={{ fontSize: 11, opacity: 0.5 }}>{subtitle}</span>}
        </div>
      )}
    </ArtifactCard>
  );
}
