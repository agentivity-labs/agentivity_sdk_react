import { useState } from 'react';
import { ArtifactCard } from '../ArtifactCard.js';
import { Calendar } from './Calendar.js';
import type { ChartProps } from '../charts/BarChart.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Date or date-range picker widget — port of `AgDatePickerCard`: the calendar of Agentivity ({@link Calendar}) inside the
 * card, a tap choosing the day (a period: its first day, then its last).
 *
 * Agent props: `{ title, question?, mode?: 'single'|'range', minDate?, maxDate?, submitLabel? }`.
 * Calls `props.__onSubmit` with e.g. `"Date: 15 Mar 2025"` or `"Period: 10 Mar 2025 → 20 Mar 2025"`.
 */
export function DatePickerCard({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Date';
  const question = typeof props['question'] === 'string' ? props['question'] : undefined;
  const mode = props['mode'] === 'range' ? 'range' : 'single';
  const submitLabel = typeof props['submitLabel'] === 'string' ? props['submitLabel'] : 'Confirm';
  const minDate = typeof props['minDate'] === 'string' ? props['minDate'] : undefined;
  const maxDate = typeof props['maxDate'] === 'string' ? props['maxDate'] : undefined;
  const onSubmit = typeof props['__onSubmit'] === 'function' ? (props['__onSubmit'] as (response: string) => void) : undefined;

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function submit() {
    if (!onSubmit || submitted || !start) return;
    const response = mode === 'range' && end ? `Period: ${fmt(start)} → ${fmt(end)}` : `Date: ${fmt(start)}`;
    setSubmitted(true);
    onSubmit(response);
  }

  return (
    <ArtifactCard title={title} type={mode === 'range' ? 'Period' : 'Date'}>
      {question && <p style={{ fontSize: 13, margin: '0 0 12px' }}>{question}</p>}
      <Calendar
        value={start || undefined}
        rangeMode={mode === 'range'}
        rangeStart={start || undefined}
        rangeEnd={end || undefined}
        min={minDate}
        max={maxDate}
        disabled={submitted}
        onChange={(day) => {
          setStart(day);
          setEnd('');
        }}
        onRangeChange={(s, e) => {
          setStart(s);
          setEnd(e ?? '');
        }}
      />
      <p style={{ fontSize: 13, margin: '10px 0 0', fontWeight: start ? 600 : 400, opacity: start ? 1 : 0.6 }}>
        {!start ? (mode === 'range' ? 'Choose the first day, then the last' : 'Choose a day') : mode === 'range' ? (end ? `${fmt(start)} → ${fmt(end)}` : `${fmt(start)} → choose the last day`) : fmt(start)}
      </p>
      <button
        type="button"
        disabled={submitted || !start || (mode === 'range' && !end)}
        onClick={submit}
        style={{ width: '100%', marginTop: 12, padding: '9px 0', borderRadius: 6, border: 'none', background: 'var(--ag-primary, #2563eb)', color: 'white', fontSize: 13, cursor: 'pointer', opacity: submitted || !start || (mode === 'range' && !end) ? 0.5 : 1 }}
      >
        {submitLabel}
      </button>
    </ArtifactCard>
  );
}
