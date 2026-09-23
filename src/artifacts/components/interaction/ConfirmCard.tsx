import { useState } from 'react';
import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

/**
 * Confirmation/approval card — port of `AgConfirmCard`. Calls
 * `props.__onSubmit` with the confirm or cancel label text.
 *
 * Agent props: `{ title, message, context?, confirmLabel?, cancelLabel? }`.
 */
export function ConfirmCard({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Confirmation';
  const message = typeof props['message'] === 'string' ? props['message'] : '';
  const context = typeof props['context'] === 'string' ? props['context'] : undefined;
  const confirmLabel = typeof props['confirmLabel'] === 'string' ? props['confirmLabel'] : 'Confirmer';
  const cancelLabel = typeof props['cancelLabel'] === 'string' ? props['cancelLabel'] : 'Annuler';
  const onSubmit = typeof props['__onSubmit'] === 'function' ? (props['__onSubmit'] as (response: string) => void) : undefined;

  const [choice, setChoice] = useState<string | undefined>(undefined);

  function choose(value: string) {
    if (!onSubmit || choice != null) return;
    setChoice(value);
    onSubmit(value);
  }

  const confirmed = choice === confirmLabel;

  return (
    <ArtifactCard title={title} type="Confirmation">
      <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{message}</p>
      {context && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 6, background: 'var(--ag-surface-container-low, #f8fafc)', border: '1px solid var(--ag-outline-variant, #e2e8f0)', fontSize: 12, opacity: 0.7 }}>
          {context}
        </div>
      )}
      {choice != null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, color: confirmed ? '#10b981' : '#ef4444', fontSize: 13, fontWeight: 500 }}>
          <span>{confirmed ? '✓' : '✕'}</span>
          <span>{choice}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={() => choose(cancelLabel)} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: '1px solid var(--ag-outline-variant, #e2e8f0)', background: 'none', fontSize: 13, cursor: 'pointer' }}>
            {cancelLabel}
          </button>
          <button type="button" onClick={() => choose(confirmLabel)} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', background: 'var(--ag-primary, #2563eb)', color: 'white', fontSize: 13, cursor: 'pointer' }}>
            {confirmLabel}
          </button>
        </div>
      )}
    </ArtifactCard>
  );
}
