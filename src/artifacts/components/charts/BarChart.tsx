import { ArtifactCard } from '../ArtifactCard.js';
import { useArtifactsTheme } from '../../../react/ArtifactsThemeProvider.js';
import { paletteColorOf, parseColor } from '../../color-utils.js';
import { asDatasets, asLabels, niceMax } from './chart-utils.js';

const LEFT_AXIS_WIDTH = 38;
const BOTTOM_AXIS_HEIGHT = 24;

export interface ChartProps {
  props: Record<string, unknown>;
}

/**
 * Bar chart artifact — hand-rolled SVG port of `AgBarChart` (no charting
 * library dependency).
 *
 * Agent props: `{ title, labels, datasets: [{ label, data, color }], height }`.
 */
export function BarChart({ props }: ChartProps) {
  const theme = useArtifactsTheme();
  const title = typeof props['title'] === 'string' ? props['title'] : 'Bar Chart';
  const labels = asLabels(props['labels']);
  const datasets = asDatasets(props['datasets']);
  const height = typeof props['height'] === 'number' ? props['height'] : 220;

  const width = 600;
  const plotWidth = width - LEFT_AXIS_WIDTH;
  const plotHeight = height - BOTTOM_AXIS_HEIGHT;
  const maxValue = niceMax(Math.max(1, ...datasets.flatMap((d) => d.data)));
  const groupWidth = labels.length > 0 ? plotWidth / labels.length : plotWidth;
  const barWidth = datasets.length > 1 ? 10 : 16;
  const gap = 4;

  return (
    <ArtifactCard title={title} type="Bar Chart" copyValue={undefined}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} height={height} role="img" aria-label={title}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={LEFT_AXIS_WIDTH}
            x2={width}
            y1={plotHeight * (1 - t)}
            y2={plotHeight * (1 - t)}
            stroke="var(--ag-outline-variant, #e2e8f0)"
            strokeOpacity={0.5}
          />
        ))}
        {[0, 0.5, 1].map((t) => (
          <text key={t} x={LEFT_AXIS_WIDTH - 6} y={plotHeight * (1 - t) + 3} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.45}>
            {Math.round(maxValue * t)}
          </text>
        ))}
        {labels.map((label, i) => {
          const groupX = LEFT_AXIS_WIDTH + i * groupWidth;
          const totalBarsWidth = datasets.length * barWidth + (datasets.length - 1) * gap;
          const startX = groupX + (groupWidth - totalBarsWidth) / 2;
          return (
            <g key={label + i}>
              {datasets.map((ds, d) => {
                const value = ds.data[i] ?? 0;
                const barHeight = maxValue > 0 ? (value / maxValue) * plotHeight : 0;
                const color = parseColor(ds.color, paletteColorOf(theme, d));
                const x = startX + d * (barWidth + gap);
                return (
                  <rect
                    key={d}
                    x={x}
                    y={plotHeight - barHeight}
                    width={barWidth}
                    height={barHeight}
                    rx={3}
                    fill={color}
                  >
                    <title>
                      {ds.label ?? `Series ${d + 1}`}: {value}
                    </title>
                  </rect>
                );
              })}
              <text x={groupX + groupWidth / 2} y={plotHeight + 14} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.55}>
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </ArtifactCard>
  );
}
