import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

interface SummaryItem {
  key: string;
  value: string;
  highlight: boolean;
}

interface SummarySection {
  label?: string;
  items: SummaryItem[];
}

function asSections(raw: unknown): SummarySection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      label: typeof s['label'] === 'string' ? s['label'] : undefined,
      items: (Array.isArray(s['items']) ? (s['items'] as unknown[]) : [])
        .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
        .map((i) => ({ key: i['key'] != null ? String(i['key']) : '', value: i['value'] != null ? String(i['value']) : '', highlight: i['highlight'] === true })),
    }));
}

/**
 * Structured summary/recap card shown before a confirmation step — port of
 * `AgSummaryCard`. Display-only — no submit callback; pair with a
 * {@link ConfirmCard} below it.
 *
 * Agent props: `{ title, sections: [{ label?, items: [{ key, value, highlight? }] }], note? }`.
 */
export function SummaryCard({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Récapitulatif';
  const note = typeof props['note'] === 'string' ? props['note'] : undefined;
  const sections = asSections(props['sections']);

  return (
    <ArtifactCard title={title} type="Récap">
      {sections.map((section, i) => (
        <div key={i} style={{ marginTop: i > 0 ? 12 : 0 }}>
          {section.label && <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, opacity: 0.45, marginBottom: 6 }}>{section.label.toUpperCase()}</div>}
          <div style={{ borderRadius: 8, border: '1px solid var(--ag-outline-variant, #e2e8f0)', background: 'var(--ag-surface-container-low, #f8fafc)' }}>
            {section.items.map((item, j) => (
              <div
                key={j}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderTop: j > 0 ? '1px solid var(--ag-outline-variant, #e2e8f0)' : undefined,
                  fontSize: 12,
                }}
              >
                <span style={{ opacity: 0.6 }}>{item.key}</span>
                <span style={{ fontWeight: item.highlight ? 700 : 500, color: item.highlight ? 'var(--ag-primary, #2563eb)' : undefined }}>{item.value}</span>
              </div>
            ))}
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
