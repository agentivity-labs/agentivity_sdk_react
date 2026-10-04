import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CSSProperties } from 'react';

export interface MarkdownBodyProps {
  data: string;
  /** Override the default text color (e.g. to contrast with a dark bubble). */
  textColor?: string;
  /** Color for hyperlinks and blockquote accents. Defaults to `var(--ag-primary)`. */
  linkColor?: string;
  className?: string;
}

/**
 * Renders Markdown text consistently across all AG-UI panels — port of
 * `AgUiMarkdownBody` (using `react-markdown` + `remark-gfm` in place of
 * `flutter_markdown_plus`).
 *
 * **Only use for completed messages.** While a message is still streaming,
 * render plain text instead — partial markdown causes unstable layouts
 * (unclosed code fences, broken list items, orphaned bold markers).
 */
export function MarkdownBody({ data, textColor, linkColor, className }: MarkdownBodyProps) {
  const link = linkColor ?? 'var(--ag-primary, #2563eb)';
  const style: CSSProperties = { color: textColor, lineHeight: 1.35 };

  return (
    <div className={className} style={style}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Every other element below gets an explicit style reset — <p> was the one left on the
          // browser's default UA margin (~1em top AND bottom), which towers over the compact spacing
          // used everywhere else here (line-height 1.35, 2-4px block margins). A message with more
          // than one paragraph showed a large, unintended gap between them because of this one gap.
          p: (props) => <p {...props} style={{ margin: '0.4em 0' }} />,
          a: (props) => <a {...props} style={{ color: link }} />,
          // An image in a message must never be wider than the bubble nor blow up to its natural size (a shop
          // photo is often 2000px): fit the width, keep the ratio, request it without a Referer (some shops refuse
          // foreign pages) and only load it when scrolled near. An address that is not http(s) renders nothing.
          img: ({ src, alt }) =>
            typeof src === 'string' && /^https?:\/\//i.test(src) ? (
              <img
                src={src}
                alt={alt ?? ''}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                style={{ display: 'block', maxWidth: '100%', maxHeight: 320, height: 'auto', objectFit: 'contain', borderRadius: 8, margin: '6px 0' }}
              />
            ) : null,
          code: (props) => {
            const { className: codeClassName, children, ...rest } = props;
            const isBlock = /language-/.test(codeClassName ?? '');
            return isBlock ? (
              <code className={codeClassName} {...rest} style={{ fontFamily: 'monospace' }}>
                {children}
              </code>
            ) : (
              <code {...rest} style={{ fontFamily: 'monospace', background: 'var(--ag-surface-container-high, #eef1f5)', borderRadius: 4, padding: '1px 4px' }}>
                {children}
              </code>
            );
          },
          pre: (props) => <pre {...props} style={{ background: 'var(--ag-surface-container-high, #eef1f5)', borderRadius: 6, padding: 12, overflowX: 'auto' }} />,
          blockquote: (props) => <blockquote {...props} style={{ borderLeft: `3px solid ${withAlpha(link, 0.5)}`, margin: 0, padding: '4px 12px' }} />,
          h1: (props) => <h1 {...props} style={{ fontSize: '1.6em', fontWeight: 700 }} />,
          h2: (props) => <h2 {...props} style={{ fontSize: '1.35em', fontWeight: 700 }} />,
          h3: (props) => <h3 {...props} style={{ fontSize: '1.15em', fontWeight: 600 }} />,
          // GFM tables: wrapped in their own scroll container so a wide table
          // never forces the chat column to overflow, and cell content is set
          // to `nowrap` — without it, the bubble's `word-break: break-word`
          // (needed elsewhere for long unbroken URLs/tokens) splits numbers
          // like "€400" into "€40" / "0" mid-token when a column is narrow.
          table: (props) => (
            <div style={{ overflowX: 'auto', margin: '8px 0' }}>
              <table {...props} style={{ borderCollapse: 'collapse', fontSize: '0.95em' }} />
            </div>
          ),
          th: (props) => (
            <th
              {...props}
              style={{
                textAlign: 'left',
                padding: '5px 10px',
                borderBottom: `2px solid ${withAlpha(link, 0.3)}`,
                whiteSpace: 'nowrap',
                fontWeight: 600,
              }}
            />
          ),
          td: (props) => (
            <td
              {...props}
              style={{
                padding: '5px 10px',
                borderBottom: `1px solid ${withAlpha(link, 0.15)}`,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
          ),
        }}
      >
        {data}
      </ReactMarkdown>
    </div>
  );
}

function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color;
  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
