import { useState } from 'react';
import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

/**
 * Star or scale rating widget — port of `AgRatingCard`. Calls
 * `props.__onSubmit` with e.g. `"Note : 4/5 — Bien"`.
 *
 * Agent props: `{ title, question?, mode?: 'stars'|'scale', max?, labels?, submitLabel? }`.
 */
export function RatingCard({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Évaluation';
  const question = typeof props['question'] === 'string' ? props['question'] : undefined;
  const mode = props['mode'] === 'scale' ? 'scale' : 'stars';
  const max = typeof props['max'] === 'number' ? props['max'] : 5;
  const labels = Array.isArray(props['labels']) ? (props['labels'] as unknown[]).map(String) : undefined;
  const submitLabel = typeof props['submitLabel'] === 'string' ? props['submitLabel'] : 'Envoyer';
  const onSubmit = typeof props['__onSubmit'] === 'function' ? (props['__onSubmit'] as (response: string) => void) : undefined;

  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);

  function pick(value: number) {
    if (submitted) return;
    setSelected(value);
  }

  function submit() {
    if (!onSubmit || submitted || selected == null) return;
    const label = labels && selected - 1 < labels.length ? ` — ${labels[selected - 1]}` : '';
    setSubmitted(true);
    onSubmit(`Note : ${selected}/${max}${label}`);
  }

  return (
    <ArtifactCard title={title} type="Rating">
      {question && <p style={{ fontSize: 13, margin: '0 0 14px' }}>{question}</p>}
      <div style={{ display: 'flex', justifyContent: 'center', gap: mode === 'stars' ? 8 : 6 }}>
        {Array.from({ length: max }, (_, i) => {
          const value = i + 1;
          const active = mode === 'stars' ? selected != null && value <= selected : selected === value;
          return mode === 'stars' ? (
            <button
              key={value}
              type="button"
              onClick={() => pick(value)}
              aria-label={`${value} star${value > 1 ? 's' : ''}`}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 28, lineHeight: 1, color: active ? '#f59e0b' : 'currentColor', opacity: active ? 1 : 0.3 }}
            >
              ★
            </button>
          ) : (
            <button
              key={value}
              type="button"
              onClick={() => pick(value)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                border: `1px solid ${active ? 'var(--ag-primary, #2563eb)' : 'var(--ag-outline-variant, #e2e8f0)'}`,
                background: active ? 'var(--ag-primary, #2563eb)' : 'var(--ag-surface-container-low, #f8fafc)',
                color: active ? 'white' : 'currentColor',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {value}
            </button>
          );
        })}
      </div>
      {selected != null && labels && selected - 1 < labels.length && (
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ag-primary, #2563eb)', fontWeight: 500, margin: '8px 0 0' }}>{labels[selected - 1]}</p>
      )}
      <button
        type="button"
        disabled={submitted || selected == null}
        onClick={submit}
        style={{ width: '100%', marginTop: 14, padding: '9px 0', borderRadius: 6, border: 'none', background: 'var(--ag-primary, #2563eb)', color: 'white', fontSize: 13, cursor: 'pointer', opacity: submitted || selected == null ? 0.5 : 1 }}
      >
        {submitLabel}
      </button>
    </ArtifactCard>
  );
}
