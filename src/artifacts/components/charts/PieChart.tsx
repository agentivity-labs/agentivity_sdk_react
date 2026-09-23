import { useState } from 'react';
import { ArtifactCard } from '../ArtifactCard.js';
import { useArtifactsTheme } from '../../../react/ArtifactsThemeProvider.js';
import { paletteColorOf, parseColor } from '../../color-utils.js';
import type { ChartProps } from './BarChart.js';

interface Section {
  label: string;
  value: number;
  color?: string;
}

function asSections(raw: unknown): Section[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({ label: typeof s['label'] === 'string' ? s['label'] : '', value: Number(s['value'] ?? 0), color: typeof s['color'] === 'string' ? s['color'] : undefined }));
}

/**
 * Pie/donut chart artifact — hand-rolled SVG port of `AgPieChart`. Hovering a
 * slice enlarges it and shows its percentage (touch-equivalent of the
 * Flutter widget's `pieTouchData`).
 *
 * Agent props: `{ title, sections: [{ label, value, color }], donut, height }`.
 */
export function PieChart({ props }: ChartProps) {
  const theme = useArtifactsTheme();
  const title = typeof props['title'] === 'string' ? props['title'] : 'Pie Chart';
  const sections = asSections(props['sections']);
  const donut = props['donut'] === true;
  const height = typeof props['height'] === 'number' ? props['height'] : 220;
  const [touched, setTouched] = useState(-1);

  const total = sections.reduce((sum, s) => sum + s.value, 0) || 1;
  const size = Math.min(height, 220);
  const cx = size / 2;
  const cy = size / 2;
  const baseRadius = size * 0.38;
  const innerRadius = donut ? size * 0.24 : 0;

  let angle = -90;
  const slices = sections.map((s, i) => {
    const fraction = s.value / total;
    const startAngle = angle;
    const endAngle = angle + fraction * 360;
    angle = endAngle;
    const radius = touched === i ? baseRadius * 1.12 : baseRadius;
    const color = parseColor(s.color, paletteColorOf(theme, i));
    return { ...s, startAngle, endAngle, radius, color, fraction };
  });

  function arcPath(startAngle: number, endAngle: number, radius: number, holeRadius: number): string {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const x0 = cx + radius * Math.cos(toRad(startAngle));
    const y0 = cy + radius * Math.sin(toRad(startAngle));
    const x1 = cx + radius * Math.cos(toRad(endAngle));
    const y1 = cy + radius * Math.sin(toRad(endAngle));
    if (holeRadius === 0) {
      return `M ${cx} ${cy} L ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} 1 ${x1} ${y1} Z`;
    }
    const ix0 = cx + holeRadius * Math.cos(toRad(startAngle));
    const iy0 = cy + holeRadius * Math.sin(toRad(startAngle));
    const ix1 = cx + holeRadius * Math.cos(toRad(endAngle));
    const iy1 = cy + holeRadius * Math.sin(toRad(endAngle));
    return `M ${ix0} ${iy0} L ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${holeRadius} ${holeRadius} 0 ${largeArc} 0 ${ix0} ${iy0} Z`;
  }

  return (
    <ArtifactCard title={title} type={donut ? 'Donut Chart' : 'Pie Chart'}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
          {slices.map((s, i) => (
            <path
              key={i}
              d={arcPath(s.startAngle, s.endAngle, s.radius, innerRadius)}
              fill={s.color}
              stroke="var(--ag-surface, #fff)"
              strokeWidth={2}
              onMouseEnter={() => setTouched(i)}
              onMouseLeave={() => setTouched((t) => (t === i ? -1 : t))}
              style={{ transition: 'd 0.15s ease' }}
            >
              <title>
                {s.label}: {Math.round(s.fraction * 100)}%
              </title>
            </path>
          ))}
        </svg>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 12px' }}>
          {sections.map((s, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, opacity: 0.7 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: parseColor(s.color, paletteColorOf(theme, i)), display: 'inline-block' }} />
              {s.label} · {Math.round((s.value / total) * 100)}%
            </span>
          ))}
        </div>
      </div>
    </ArtifactCard>
  );
}
