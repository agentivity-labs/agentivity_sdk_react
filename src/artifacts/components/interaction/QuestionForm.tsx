import { useState } from 'react';
import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

interface Question {
  id: string;
  label: string;
  hint?: string;
  required: boolean;
}

function asQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object')
    .map((q, i) => ({
      id: q['id'] != null ? String(q['id']) : `q${i}`,
      label: q['label'] != null ? String(q['label']) : `Question ${i + 1}`,
      hint: q['hint'] != null ? String(q['hint']) : undefined,
      required: q['required'] !== false,
    }));
}

/**
 * Multi-question form widget — port of `AgQuestionForm`. Calls
 * `props.__onSubmit` with a structured text response:
 * ```
 * • Label → answer
 * • Label 2 → answer 2
 * ```
 *
 * Agent props: `{ title, questions: [{ id, label, hint?, required? }], submitLabel? }`.
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
    const lines = questions.map((q) => [q.label, (answers[q.id] ?? '').trim()] as const).filter(([, a]) => a.length > 0).map(([label, a]) => `• ${label} → ${a}`);
    if (lines.length === 0) return;
    setSubmitted(true);
    onSubmit(lines.join('\n'));
  }

  return (
    <ArtifactCard title={title}>
      {questions.map((q, i) => (
        <div key={q.id} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{q.label}</span>
            {!q.required && <span style={{ fontSize: 10, opacity: 0.45 }}>Optionnel</span>}
          </div>
          <input
            type="text"
            placeholder={q.hint}
            disabled={submitted}
            value={answers[q.id] ?? ''}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && i === questions.length - 1) submit();
            }}
            style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--ag-outline-variant, #e2e8f0)' }}
          />
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
