import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

const FIT_MAP: Record<string, string> = {
  contain: 'contain',
  cover: 'cover',
  fill: 'fill',
  none: 'none',
  // CSS object-fit has no fitWidth/fitHeight equivalent — contain is the closest fallback.
  fitWidth: 'contain',
  fitHeight: 'contain',
};

/**
 * SVG image renderer — port of `AgSvg`. Renders the agent-supplied `svg`
 * markup string directly (same trust model as the Flutter SDK's
 * `SvgPicture.string`).
 *
 * Agent props: `{ title, svg, height?, fit? }`. `fit` is a CSS `object-fit`
 * name: `contain` (default), `cover`, `fill`, `none`.
 */
export function Svg({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'SVG';
  const svg = props['svg'] != null ? String(props['svg']) : '<svg xmlns="http://www.w3.org/2000/svg"/>';
  const height = typeof props['height'] === 'number' ? props['height'] : 300;
  const fit = FIT_MAP[typeof props['fit'] === 'string' ? props['fit'] : ''] ?? 'contain';

  return (
    <ArtifactCard title={title} type="SVG">
      <div
        style={{ height, width: '100%', display: 'flex' }}
        // eslint-disable-next-line react/no-danger -- agent-supplied SVG markup, same trust model as SvgPicture.string
        dangerouslySetInnerHTML={{ __html: withFit(svg, fit) }}
      />
    </ArtifactCard>
  );
}

function withFit(svg: string, fit: string): string {
  return svg.replace('<svg', `<svg style="width:100%;height:100%;object-fit:${fit}"`);
}
