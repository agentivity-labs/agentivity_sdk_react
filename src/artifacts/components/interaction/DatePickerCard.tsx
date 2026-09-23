import { useState } from 'react';
import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Date or date-range picker widget — port of `AgDatePickerCard`. Uses the
 * browser's native `<input type="date">` picker rather than a custom dialog
 * (zero extra dependency, familiar OS-native UI).
 *
 * Agent props: `{ title, question?, mode?: 'single'|'range', minDate?, maxDate?, submitLabel? }`.
 * Calls `props.__onSubmit` with e.g. `"Date : 15 mars 2025"` or `"Période : 10 mars 2025 → 20 mars 2025"`.
 */
export function DatePickerCard({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Date';
  const question = typeof props['question'] === 'string' ? props['question'] : undefined;
  const mode = props['mode'] === 'range' ? 'range' : 'single';
  const submitLabel = typeof props['submitLabel'] === 'string' ? props['submitLabel'] : 'Confirmer';
  const minDate = typeof props['minDate'] === 'string' ? props['minDate'] : undefined;
  const maxDate = typeof props['maxDate'] === 'string' ? props['maxDate'] : undefined;
  const onSubmit = typeof props['__onSubmit'] === 'function' ? (props['__onSubmit'] as (response: string) => void) : undefined;

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function submit() {
    if (!onSubmit || submitted || !start) return;
    const response = mode === 'range' && end ? `Période : ${fmt(start)} → ${fmt(end)}` : `Date : ${fmt(start)}`;
    setSubmitted(true);
    onSubmit(response);
  }

  const inputStyle = {
    fontSize: 13,
    padding: '10px 12px',
    borderRadius: 8,
    border: `${start ? 1.5 : 1}px solid ${start ? 'var(--ag-primary, #2563eb)' : 'var(--ag-outline-variant, #e2e8f0)'}`,
    background: 'var(--ag-surface-container-low, #f8fafc)',
    // flex-basis + min-width:0 (not width:100%, which fights its sibling for
    // space) — lets each input shrink below its native rendering width, and
    // flexWrap below lets the pair stack instead of overflowing when neither
    // can shrink enough.
    flex: '1 1 130px',
    minWidth: 0,
    boxSizing: 'border-box',
  } as const;

  return (
    <ArtifactCard title={title} type={mode === 'range' ? 'Période' : 'Date'}>
      {question && <p style={{ fontSize: 13, margin: '0 0 12px' }}>{question}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="date" value={start} min={minDate} max={maxDate} disabled={submitted} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
        {mode === 'range' && <input type="date" value={end} min={start || minDate} max={maxDate} disabled={submitted} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />}
      </div>
      <button
        type="button"
        disabled={submitted || !start}
        onClick={submit}
        style={{ width: '100%', marginTop: 12, padding: '9px 0', borderRadius: 6, border: 'none', background: 'var(--ag-primary, #2563eb)', color: 'white', fontSize: 13, cursor: 'pointer', opacity: submitted || !start ? 0.5 : 1 }}
      >
        {submitLabel}
      </button>
    </ArtifactCard>
  );
}
