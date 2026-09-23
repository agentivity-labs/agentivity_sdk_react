import { useState } from 'react';
import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

interface Option {
  id: string;
  label: string;
  description?: string;
}

function asOptions(raw: unknown): Option[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
    .map((o) => ({ id: o['id'] != null ? String(o['id']) : '', label: o['label'] != null ? String(o['label']) : String(o['id'] ?? ''), description: o['description'] != null ? String(o['description']) : undefined }));
}

/**
 * Single or multi-select choice widget — port of `AgChoiceCard`. Calls
 * `props.__onSubmit` with selected label(s): single → `"Choix : Gaming"`,
 * multiple → `"Choix : Gaming, Professionnel"`.
 *
 * Agent props: `{ title, question?, multiple?, options: [{ id, label, description? }], submitLabel? }`.
 */
export function ChoiceCard({ props }: ChartProps) {
  const options = asOptions(props['options']);
  const multiple = props['multiple'] === true;
  const title = typeof props['title'] === 'string' ? props['title'] : 'Choix';
  const question = typeof props['question'] === 'string' ? props['question'] : undefined;
  const submitLabel = typeof props['submitLabel'] === 'string' ? props['submitLabel'] : 'Confirmer';
  const onSubmit = typeof props['__onSubmit'] === 'function' ? (props['__onSubmit'] as (response: string) => void) : undefined;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  function toggle(id: string) {
    if (submitted) return;
    setSelected((prev) => {
      if (multiple) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return new Set([id]);
    });
  }

  function submit() {
    if (!onSubmit || submitted || selected.size === 0) return;
    const labels = [...selected].map((id) => options.find((o) => o.id === id)?.label ?? id).join(', ');
    setSubmitted(true);
    onSubmit(`Choix : ${labels}`);
  }

  return (
    <ArtifactCard title={title} type={multiple ? 'Multi-select' : 'Select'}>
      {question && <p style={{ fontSize: 13, opacity: 0.8, margin: '0 0 12px' }}>{question}</p>}
      {options.map((opt) => {
        const isSelected = selected.has(opt.id);
        return (
          <div
            key={opt.id}
            role="button"
            tabIndex={0}
            onClick={() => toggle(opt.id)}
            onKeyDown={(e) => e.key === 'Enter' && toggle(opt.id)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginBottom: 6,
              padding: '10px 12px',
              borderRadius: 8,
              cursor: 'pointer',
              background: isSelected ? 'var(--ag-primary-container, #dbeafe)' : 'var(--ag-surface-container-low, #f8fafc)',
              border: `${isSelected ? 1.5 : 1}px solid ${isSelected ? 'var(--ag-primary, #2563eb)' : 'var(--ag-outline-variant, #e2e8f0)'}`,
            }}
          >
            <span style={{ color: isSelected ? 'var(--ag-primary, #2563eb)' : 'currentColor', opacity: isSelected ? 1 : 0.4 }}>
              {multiple ? (isSelected ? '☑' : '☐') : isSelected ? '◉' : '○'}
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
              {opt.description && <div style={{ fontSize: 11, opacity: 0.55 }}>{opt.description}</div>}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        disabled={submitted || selected.size === 0}
        onClick={submit}
        style={{ width: '100%', marginTop: 8, padding: '9px 0', borderRadius: 6, border: 'none', background: 'var(--ag-primary, #2563eb)', color: 'white', fontSize: 13, cursor: 'pointer', opacity: submitted || selected.size === 0 ? 0.5 : 1 }}
      >
        {submitLabel}
      </button>
    </ArtifactCard>
  );
}
