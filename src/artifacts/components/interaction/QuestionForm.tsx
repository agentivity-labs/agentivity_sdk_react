import { useState } from 'react';
import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

type QuestionType = 'text' | 'date' | 'number' | 'boolean';

interface Question {
  id: string;
  label: string;
  hint?: string;
  required: boolean;
  type: QuestionType;
}

const QUESTION_TYPES: readonly QuestionType[] = ['text', 'date', 'number', 'boolean'];

function asQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object')
    .map((q, i) => {
      const type = QUESTION_TYPES.includes(q['type'] as QuestionType) ? (q['type'] as QuestionType) : 'text';
      return {
        id: q['id'] != null ? String(q['id']) : `q${i}`,
        label: q['label'] != null ? String(q['label']) : `Question ${i + 1}`,
        hint: q['hint'] != null ? String(q['hint']) : undefined,
        required: q['required'] !== false,
        type,
      };
    });
}

/**
 * Multi-question form widget — port of `AgQuestionForm`. Calls
 * `props.__onSubmit` with a structured text response:
 * ```
 * • Label → answer
 * • Label 2 → answer 2
 * ```
 * A boolean answer reads as "Yes"/"No"; a date answer as its ISO date (`2027-07-01`).
 *
 * Agent props: `{ title, questions: [{ id, label, hint?, required?, type? }], submitLabel? }`.
 * `type` is `'text'` (default), `'date'` (a native date picker — always use this for a question about
 * a date, never a free-text field), `'number'`, or `'boolean'` (Yes/No).
 */
export function QuestionForm({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Questions';
  const submitLabel = typeof props['submitLabel'] === 'string' ? props['submitLabel'] : 'Envoyer';
  const questions = asQuestions(props['questions']);
  const onSubmit = typeof props['__onSubmit'] === 'function' ? (props['__onSubmit'] as (response: string) => void) : undefined;

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function submit() {
    if (!onSubmit || submitted) return;
    const lines = questions
      .map((q) => [q.label, (answers[q.id] ?? '').trim()] as const)
      .filter(([, a]) => a.length > 0)
      .map(([label, a]) => `• ${label} → ${a}`);
    if (lines.length === 0) return;
    setSubmitted(true);
    onSubmit(lines.join('\n'));
  }

  const fieldStyle = { width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--ag-outline-variant, #e2e8f0)', boxSizing: 'border-box' as const };

  function field(q: Question, isLast: boolean) {
    const onEnter = (e: { key: string }) => {
      if (e.key === 'Enter' && isLast) submit();
    };
    if (q.type === 'boolean') {
      const value = answers[q.id];
      const option = (label: string, answer: 'Yes' | 'No') => (
        <button
          key={answer}
          type="button"
          disabled={submitted}
          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: answer }))}
          style={{
            flex: 1,
            padding: '8px 0',
            fontSize: 13,
            borderRadius: 6,
            border: `1px solid ${value === answer ? 'var(--ag-primary, #2563eb)' : 'var(--ag-outline-variant, #e2e8f0)'}`,
            background: value === answer ? 'var(--ag-primary, #2563eb)' : 'transparent',
            color: value === answer ? 'white' : 'inherit',
            cursor: 'pointer',
          }}
        >
          {label}
        </button>
      );
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          {option('Yes', 'Yes')}
          {option('No', 'No')}
        </div>
      );
    }
    if (q.type === 'number') {
      return (
        <input
          type="number"
          inputMode="decimal"
          placeholder={q.hint}
          disabled={submitted}
          value={answers[q.id] ?? ''}
          onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
          onKeyDown={onEnter}
          style={fieldStyle}
        />
      );
    }
    if (q.type === 'date') {
      return (
        <input
          type="date"
          disabled={submitted}
          value={answers[q.id] ?? ''}
          onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
          onKeyDown={onEnter}
          style={fieldStyle}
        />
      );
    }
    return (
      <input
        type="text"
        placeholder={q.hint}
        disabled={submitted}
        value={answers[q.id] ?? ''}
        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
        onKeyDown={onEnter}
        style={fieldStyle}
      />
    );
  }

  return (
    <ArtifactCard title={title}>
      {questions.map((q, i) => (
        <div key={q.id} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{q.label}</span>
            {!q.required && <span style={{ fontSize: 10, opacity: 0.45 }}>Optionnel</span>}
          </div>
          {field(q, i === questions.length - 1)}
          {q.hint && q.type !== 'text' && q.type !== 'number' && <p style={{ fontSize: 11, opacity: 0.55, margin: '4px 0 0' }}>{q.hint}</p>}
        </div>
      ))}
      <button
        type="button"
        disabled={submitted}
        onClick={submit}
        style={{ width: '100%', padding: '9px 0', borderRadius: 6, border: 'none', background: 'var(--ag-primary, #2563eb)', color: 'white', fontSize: 13, cursor: 'pointer', opacity: submitted ? 0.5 : 1 }}
      >
        {submitLabel}
      </button>
    </ArtifactCard>
  );
}
