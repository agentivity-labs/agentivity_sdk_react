import { ArtifactCard } from '../ArtifactCard.js';
import { useArtifactsTheme } from '../../../react/ArtifactsThemeProvider.js';
import { paletteColorOf, parseColor } from '../../color-utils.js';
import { asDatasets, asLabels, niceMax } from './chart-utils.js';
import type { ChartProps } from './BarChart.js';

const TICK_COUNT = 4;

/**
 * Radar/spider chart artifact — hand-rolled SVG port of `AgRadarChart`.
 *
 * Agent props: `{ title, labels, datasets: [{ label, data, color }], max, height }`.
 */
export function RadarChart({ props }: ChartProps) {
  const theme = useArtifactsTheme();
  const title = typeof props['title'] === 'string' ? props['title'] : 'Radar Chart';
  const labels = asLabels(props['labels']);
  const datasets = asDatasets(props['datasets']);
  const height = typeof props['height'] === 'number' ? props['height'] : 260;
  const explicitMax = typeof props['max'] === 'number' ? props['max'] : undefined;

  const size = Math.min(height, 320);
  const cx = size / 2;
  const cy = size / 2 - 6;
  const radius = size * 0.34;
  const axisCount = labels.length || Math.max(...datasets.map((d) => d.data.length), 0);
  const maxValue = explicitMax ?? niceMax(Math.max(1, ...datasets.flatMap((d) => d.data)));

  function pointFor(index: number, value: number): [number, number] {
    const angle = -90 + (360 / axisCount) * index;
    const rad = (angle * Math.PI) / 180;
    const r = maxValue > 0 ? (value / maxValue) * radius : 0;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  function axisPoint(index: number, r: number): [number, number] {
    const angle = -90 + (360 / axisCount) * index;
    const rad = (angle * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  const gridColor = 'var(--ag-outline-variant, #e2e8f0)';

  return (
    <ArtifactCard title={title} type="Radar">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
          {Array.from({ length: TICK_COUNT }, (_, t) => {
            const r = (radius * (t + 1)) / TICK_COUNT;
            const points = Array.from({ length: axisCount }, (_, i) => axisPoint(i, r).join(',')).join(' ');
            return <polygon key={t} points={points} fill="none" stroke={gridColor} strokeOpacity={0.4} />;
          })}
          {Array.from({ length: axisCount }, (_, i) => {
            const [x, y] = axisPoint(i, radius);
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={gridColor} strokeOpacity={0.4} />;
          })}
          {labels.map((label, i) => {
            const [x, y] = axisPoint(i, radius * 1.18);
            return (
              <text key={label + i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={500} fill="currentColor" opacity={0.65}>
                {label}
              </text>
            );
          })}
          {datasets.map((ds, d) => {
            const color = parseColor(ds.color, paletteColorOf(theme, d));
            const points = ds.data.map((v, i) => pointFor(i, v));
            const path = points.map(([x, y]) => `${x},${y}`).join(' ');
            return (
              <g key={d}>
                <polygon points={path} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2} />
                {points.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={3} fill={color} />
                ))}
              </g>
            );
          })}
        </svg>
        {datasets.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
            {datasets.map((ds, d) => (
              <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, opacity: 0.65 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: parseColor(ds.color, paletteColorOf(theme, d)), display: 'inline-block' }} />
                {ds.label ?? `Series ${d + 1}`}
              </span>
            ))}
          </div>
        )}
      </div>
    </ArtifactCard>
  );
}
