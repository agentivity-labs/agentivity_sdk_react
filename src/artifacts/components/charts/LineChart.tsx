import { ArtifactCard } from '../ArtifactCard.js';
import { useArtifactsTheme } from '../../../react/ArtifactsThemeProvider.js';
import { paletteColorOf, parseColor } from '../../color-utils.js';
import { asDatasets, asLabels, linearPath, niceMax, smoothPath, type Dataset } from './chart-utils.js';
import type { ChartProps } from './BarChart.js';

const LEFT_AXIS_WIDTH = 38;
const BOTTOM_AXIS_HEIGHT = 24;

/**
 * Line chart artifact — hand-rolled SVG port of `AgLineChart`.
 *
 * Agent props: `{ title, labels, datasets: [{ label, data, color, smooth, fill }], height }`.
 */
export function LineChart({ props }: ChartProps) {
  return <LineOrAreaChart props={props} forceFill={false} defaultTitle="Line Chart" />;
}

/**
 * Area (filled line) chart artifact — port of `AgAreaChart`. Same props as
 * {@link LineChart} but every dataset renders filled, regardless of its own
 * `fill` flag.
 */
export function AreaChart({ props }: ChartProps) {
  return <LineOrAreaChart props={props} forceFill defaultTitle="Area Chart" />;
}

function LineOrAreaChart({ props, forceFill, defaultTitle }: ChartProps & { forceFill: boolean; defaultTitle: string }) {
  const theme = useArtifactsTheme();
  const title = typeof props['title'] === 'string' ? props['title'] : defaultTitle;
  const labels = asLabels(props['labels']);
  const datasets = asDatasets(props['datasets']);
  const height = typeof props['height'] === 'number' ? props['height'] : forceFill ? 200 : 220;

  const width = 600;
  const plotWidth = width - LEFT_AXIS_WIDTH;
  const plotHeight = height - BOTTOM_AXIS_HEIGHT;
  const maxValue = niceMax(Math.max(1, ...datasets.flatMap((d) => d.data)));
  const stepX = labels.length > 1 ? plotWidth / (labels.length - 1) : 0;

  function toPoints(ds: Dataset): [number, number][] {
    return ds.data.map((v, i) => [LEFT_AXIS_WIDTH + i * stepX, maxValue > 0 ? plotHeight - (v / maxValue) * plotHeight : plotHeight]);
  }

  return (
    <ArtifactCard title={title} type={defaultTitle}>
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
        {labels.map((label, i) => (
          <text key={label + i} x={LEFT_AXIS_WIDTH + i * stepX} y={plotHeight + 14} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.55}>
            {label}
          </text>
        ))}
        {datasets.map((ds, d) => {
          const color = parseColor(ds.color, paletteColorOf(theme, d));
          const points = toPoints(ds);
          const linePath = ds.smooth ? smoothPath(points) : linearPath(points);
          const fill = forceFill || ds.fill;
          const gradientId = `ag-area-grad-${d}-${title.replace(/\W+/g, '')}`;
          return (
            <g key={d}>
              {fill && points.length > 0 && (
                <>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <path
                    d={`${linePath} L ${points[points.length - 1]![0]} ${plotHeight} L ${points[0]![0]} ${plotHeight} Z`}
                    fill={`url(#${gradientId})`}
                    stroke="none"
                  />
                </>
              )}
              <path d={linePath} fill="none" stroke={color} strokeWidth={2}>
                <title>{ds.label ?? `Series ${d + 1}`}</title>
              </path>
            </g>
          );
        })}
      </svg>
    </ArtifactCard>
  );
}
