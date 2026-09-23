/** Shared helpers for the hand-rolled SVG chart widgets (no charting library dependency). */

export interface Dataset {
  label?: string;
  data: number[];
  color?: string;
  smooth?: boolean;
  fill?: boolean;
}

export function asDatasets(raw: unknown): Dataset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
    .map((d) => ({
      label: typeof d['label'] === 'string' ? d['label'] : undefined,
      data: Array.isArray(d['data']) ? (d['data'] as unknown[]).map(Number) : [],
      color: typeof d['color'] === 'string' ? d['color'] : undefined,
      smooth: d['smooth'] !== false,
      fill: d['fill'] === true,
    }));
}

export function asLabels(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(String) : [];
}

/** "Nice" rounded max for a y-axis, so gridlines land on round numbers. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

/** Builds a smooth cubic-bezier path through `points` (Catmull-Rom-ish, matches fl_chart's curve feel). */
export function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]![0]} ${points[0]![1]}`;
  let d = `M ${points[0]![0]} ${points[0]![1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

export function linearPath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
}
