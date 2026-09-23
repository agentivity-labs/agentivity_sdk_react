import { useMemo } from 'react';
import hljs from 'highlight.js';
import { ArtifactCard } from '../ArtifactCard.js';
import { useArtifactsTheme } from '../../../react/ArtifactsThemeProvider.js';
import { effectiveCodeFontSize } from '../../theme.js';
import type { ChartProps } from '../charts/BarChart.js';

/**
 * Syntax-highlighted code block — port of `AgCodeBlock` (using `highlight.js`
 * in place of `flutter_highlight`; both wrap the same highlight.js grammar
 * ecosystem, so `language` values are compatible).
 *
 * Agent props: `{ title, language, code, maxLines? }`. Pass `theme: 'light' | 'dark'`
 * (defaults to `'dark'`) to pick the token color scheme — see the `.ag-code-block`
 * rules in the package's `styles.css` for the two palettes.
 */
export function CodeBlock({ props, theme: colorTheme = 'dark' }: ChartProps & { theme?: 'light' | 'dark' }) {
  const artifactsTheme = useArtifactsTheme();
  const title = typeof props['title'] === 'string' ? props['title'] : 'Code';
  const language = typeof props['language'] === 'string' ? props['language'] : 'plaintext';
  const code = props['code'] != null ? String(props['code']) : '';
  const maxLines = typeof props['maxLines'] === 'number' ? props['maxLines'] : 40;

  const highlighted = useMemo(() => {
    try {
      return hljs.getLanguage(language) ? hljs.highlight(code, { language }).value : hljs.highlightAuto(code).value;
    } catch {
      return escapeHtml(code);
    }
  }, [code, language]);

  return (
    <ArtifactCard title={title} type={language} copyValue={code} padding="0">
      <div className={`ag-code-block ag-code-block--${colorTheme}`} style={{ maxHeight: maxLines * 18, overflow: 'auto', borderRadius: '0 0 5px 5px' }}>
        <pre style={{ margin: 0, padding: 12 }}>
          <code
            className="hljs"
            style={{ fontFamily: artifactsTheme.codeFontFamily ?? 'monospace', fontSize: effectiveCodeFontSize(artifactsTheme), lineHeight: 1.5 }}
            // eslint-disable-next-line react/no-danger -- highlight.js output, not user HTML
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>
    </ArtifactCard>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}
