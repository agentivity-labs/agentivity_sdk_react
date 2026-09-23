import { MetricCard } from './MetricCard.js';
import type { ChartProps } from '../charts/BarChart.js';

/**
 * Grid of KPI metric cards — port of `AgStatGrid`.
 *
 * Agent props: `{ columns?, metrics: [...MetricCard props] }`.
 *
 * Uses CSS Grid's `auto-fit`/`minmax` to reflow responsively — the React/CSS
 * equivalent of the Flutter widget's `LayoutBuilder`-based breakpoint logic,
 * without needing to measure layout in JS. When `columns` is set, it caps the
 * column count via `repeat(min(columns, N), minmax(...))`.
 */
export function StatGrid({ props }: ChartProps) {
  const metrics = Array.isArray(props['metrics']) ? (props['metrics'] as Record<string, unknown>[]) : [];
  const forcedCols = typeof props['columns'] === 'number' && props['columns'] > 0 ? Math.floor(props['columns']) : undefined;

  return (
    <div
      style={{
        display: 'grid',
        gap: 8,
        gridTemplateColumns: forcedCols
          ? `repeat(auto-fit, minmax(min(220px, 100%/${forcedCols}), 1fr))`
          : 'repeat(auto-fit, minmax(160px, 1fr))',
      }}
    >
      {metrics.map((m, i) => (
        <MetricCard key={i} props={m} />
      ))}
    </div>
  );
}
