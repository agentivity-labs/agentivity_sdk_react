import { ArtifactCard } from '../ArtifactCard.js';
import { ArtifactImage, safeHttpUrl, safeImageUrl } from '../ArtifactImage.js';
import type { ChartProps } from '../charts/BarChart.js';

interface SummaryItem {
  key: string;
  value: string;
  highlight: boolean;
}

interface SummarySection {
  label?: string;
  imageUrl?: string;
  imageAlt?: string;
  /** Short highlighted tag next to the label, e.g. "Best value". */
  badge?: string;
  /** Where the section's subject can be seen (shop page, article) — makes the label and picture a link. */
  url?: string;
  items: SummaryItem[];
}

function asSections(raw: unknown): SummarySection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      label: typeof s['label'] === 'string' ? s['label'] : undefined,
      imageUrl: safeImageUrl(s['imageUrl']),
      imageAlt: typeof s['imageAlt'] === 'string' ? s['imageAlt'] : undefined,
      badge: typeof s['badge'] === 'string' && s['badge'].trim() ? s['badge'] : undefined,
      url: safeHttpUrl(s['url']),
      items: (Array.isArray(s['items']) ? (s['items'] as unknown[]) : [])
        .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
        .map((i) => ({ key: i['key'] != null ? String(i['key']) : '', value: i['value'] != null ? String(i['value']) : '', highlight: i['highlight'] === true })),
    }));
}

const SECTION_IMAGE_SIZE = 120;

/**
 * Structured summary/recap card shown before a confirmation step — port of
 * `AgSummaryCard`. Display-only — no submit callback; pair with a
 * {@link ConfirmCard} below it.
 *
 * Agent props: `{ title, imageUrl?, imageAlt?, sections: [{ label?, imageUrl?, imageAlt?, badge?, url?, items: [{ key, value, highlight? }] }], note? }`.
 *
 * Pictures make a section a "product sheet": a card with three sections is three products, each with its photo,
 * its facts and an optional badge and link. `imageUrl` on the card itself is a banner above all sections.
 */
export function SummaryCard({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Récapitulatif';
  const note = typeof props['note'] === 'string' ? props['note'] : undefined;
  const sections = asSections(props['sections']);
  const bannerUrl = safeImageUrl(props['imageUrl']);
  const bannerAlt = typeof props['imageAlt'] === 'string' ? props['imageAlt'] : title;

  return (
    <ArtifactCard title={title} type="Récap">
      {bannerUrl && <ArtifactImage src={bannerUrl} alt={bannerAlt} aspectRatio="16 / 7" fit="cover" style={{ marginBottom: 12 }} />}
      {sections.map((section, i) => (
        <div key={i} style={{ marginTop: i > 0 ? 12 : 0 }}>
          {(section.label || section.badge) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, minWidth: 0 }}>
              {section.label &&
                (section.url ? (
                  <a href={section.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, opacity: 0.7, color: 'inherit', textDecoration: 'underline' }}>
                    {section.label.toUpperCase()}
                  </a>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, opacity: 0.45 }}>{section.label.toUpperCase()}</span>
                ))}
              {section.badge && (
                <span style={{ fontSize: 10, fontWeight: 600, borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap', background: 'var(--ag-primary-container, #dbeafe)', color: 'var(--ag-primary, #2563eb)' }}>
                  {section.badge}
                </span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
            {section.imageUrl &&
              (section.url ? (
                <a href={section.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: SECTION_IMAGE_SIZE, maxWidth: '100%', flexShrink: 0 }}>
                  <ArtifactImage src={section.imageUrl} alt={section.imageAlt ?? section.label} aspectRatio="1 / 1" />
                </a>
              ) : (
                <ArtifactImage src={section.imageUrl} alt={section.imageAlt ?? section.label} aspectRatio="1 / 1" width={SECTION_IMAGE_SIZE} />
              ))}
            <div style={{ flex: '1 1 200px', minWidth: 0, borderRadius: 8, border: '1px solid var(--ag-outline-variant, #e2e8f0)', background: 'var(--ag-surface-container-low, #f8fafc)' }}>
              {section.items.map((item, j) => (
                <div
                  key={j}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '9px 12px',
                    borderTop: j > 0 ? '1px solid var(--ag-outline-variant, #e2e8f0)' : undefined,
                    fontSize: 12,
                  }}
                >
                  <span style={{ opacity: 0.6 }}>{item.key}</span>
                  <span style={{ fontWeight: item.highlight ? 700 : 500, color: item.highlight ? 'var(--ag-primary, #2563eb)' : undefined, textAlign: 'right' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      {note && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, fontSize: 11, opacity: 0.55 }}>
          <span style={{ opacity: 0.4 }}>ⓘ</span>
          <span>{note}</span>
        </div>
      )}
    </ArtifactCard>
  );
}
