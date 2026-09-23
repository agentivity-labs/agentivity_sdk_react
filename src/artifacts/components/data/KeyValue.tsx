import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

interface KeyValueItem {
  key: string;
  value: string;
  highlight: boolean;
}

function asItems(raw: unknown): KeyValueItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({ key: i['key'] != null ? String(i['key']) : '', value: i['value'] != null ? String(i['value']) : '', highlight: i['highlight'] === true }));
}

/**
 * Key → value property list — port of `AgKeyValue`.
 *
 * Agent props: `{ title, items: [{ key, value, highlight? }], dividers? }`.
 */
export function KeyValue({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Properties';
  const items = asItems(props['items']);
  const showDividers = props['dividers'] !== false;

  return (
    <ArtifactCard title={title} type="Key–Value">
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '7px 0',
            borderTop: showDividers && i > 0 ? '1px solid var(--ag-outline-variant, #e2e8f0)' : undefined,
          }}
        >
          <span style={{ flex: 4, fontSize: 12, opacity: 0.55 }}>{item.key}</span>
          <span style={{ flex: 6, fontSize: 12, fontWeight: 600, textAlign: 'right', color: item.highlight ? 'var(--ag-primary, #2563eb)' : undefined }}>{item.value}</span>
        </div>
      ))}
    </ArtifactCard>
  );
}
