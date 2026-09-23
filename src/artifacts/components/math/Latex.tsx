import { useMemo } from 'react';
import katex from 'katex';
import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

/**
 * LaTeX math rendering via KaTeX — port of `AgLatex` (which used
 * `flutter_math_fork`, itself KaTeX-syntax-compatible, so `tex` values are
 * portable as-is).
 *
 * Agent props: `{ title, tex, display? }`. `display: true` (default) renders
 * as a centered display block; `false` renders inline-style.
 *
 * **Setup**: also import `katex/dist/katex.min.css` in your app (KaTeX ships
 * its own fonts/glyphs — not bundled into this package's `styles.css`).
 */
export function Latex({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Math';
  const tex = props['tex'] != null ? String(props['tex']) : '\\text{(no expression)}';
  const display = props['display'] !== false;

  const { html, error } = useMemo(() => {
    try {
      return { html: katex.renderToString(tex, { displayMode: display, throwOnError: true }), error: undefined };
    } catch (e) {
      return { html: undefined, error: e instanceof Error ? e.message : String(e) };
    }
  }, [tex, display]);

  return (
    <ArtifactCard title={title} type="LaTeX">
      <div style={{ textAlign: 'center', overflowX: 'auto', padding: '8px 0', fontSize: display ? 20 : 16 }}>
        {error ? <span style={{ fontSize: 12, color: '#ef4444' }}>LaTeX error: {error}</span> : <span dangerouslySetInnerHTML={{ __html: html! }} />}
      </div>
    </ArtifactCard>
  );
}
