import { useState } from 'react';
import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

const INDENT_PX = 14;

/**
 * Collapsible JSON tree viewer — port of `AgJsonViewer`.
 *
 * Agent props: `{ title, data, expanded? }`. `data` can be any
 * JSON-serializable value; `expanded` controls whether object/array nodes
 * start open (default `true`).
 */
export function JsonViewer({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'JSON';
  const expanded = props['expanded'] !== false;

  return (
    <ArtifactCard title={title} type="JSON">
      <div style={{ overflowX: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
        <JsonNode value={props['data']} expanded={expanded} depth={0} />
      </div>
    </ArtifactCard>
  );
}

function isComplex(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object';
}

function JsonNode({ value, expanded, depth, keyName }: { value: unknown; expanded: boolean; depth: number; keyName?: string }) {
  const [open, setOpen] = useState(expanded);

  if (!isComplex(value)) {
    return <ScalarRow value={value} depth={depth} keyName={keyName} />;
  }

  const isArray = Array.isArray(value);
  const entries: [string, unknown][] = isArray ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  const [open_, close_] = isArray ? ['[', ']'] : ['{', '}'];

  const header = (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}
      style={{ paddingLeft: depth * INDENT_PX, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, userSelect: 'none' }}
    >
      <span style={{ opacity: 0.4, fontSize: 10 }}>{open ? '▾' : '▸'}</span>
      {keyName != null && <span style={{ color: 'var(--ag-primary, #2563eb)', opacity: 0.85 }}>&quot;{keyName}&quot;: </span>}
      <span style={{ opacity: 0.6 }}>{open ? open_ : `${open_}…${close_} (${entries.length})`}</span>
    </div>
  );

  if (!open) return header;

  return (
    <div>
      {header}
      {entries.map(([k, v]) => (
        <JsonNode key={k} value={v} keyName={isArray ? undefined : k} expanded={expanded} depth={depth + 1} />
      ))}
      <div style={{ paddingLeft: depth * INDENT_PX + 16, opacity: 0.6 }}>{close_}</div>
    </div>
  );
}

function ScalarRow({ value, depth, keyName }: { value: unknown; depth: number; keyName?: string }) {
  const color = value == null ? 'currentColor' : typeof value === 'boolean' ? '#8b5cf6' : typeof value === 'number' ? '#10b981' : '#f59e0b';
  const opacity = value == null ? 0.4 : 1;
  const text = value == null ? 'null' : typeof value === 'string' ? `"${value}"` : JSON.stringify(value);

  return (
    <div style={{ paddingLeft: depth * INDENT_PX + 16, paddingTop: 1, paddingBottom: 1, display: 'flex', gap: 0 }}>
      {keyName != null && <span style={{ color: 'var(--ag-primary, #2563eb)', opacity: 0.85 }}>&quot;{keyName}&quot;: </span>}
      <span style={{ color, opacity }}>{text}</span>
    </div>
  );
}
