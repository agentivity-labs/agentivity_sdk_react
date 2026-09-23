import { useState, type ReactNode } from 'react';
import type { FormController } from '../forms/form-controller.js';
import type { AgFormField, FormOutcome, FormRequest } from '../forms/form-models.js';

export interface FormPanelProps {
  request: FormRequest;
  controller: FormController;
  /** Override rendering of a single field. */
  fieldBuilder?: (field: AgFormField, value: unknown, onChange: (value: unknown) => void) => ReactNode;
  /** Override the entire actions row (approve/reject/submit buttons). */
  actionsBuilder?: (request: FormRequest, onAct: (outcome: FormOutcome) => void) => ReactNode;
  /** Called after successful submission. */
  onSubmitted?: () => void;
  className?: string;
}

/**
 * Renders a single {@link FormRequest} as an interactive form — port of
 * `AgUiFormPanel`. Override buttons or individual fields with builder callbacks.
 */
export function FormPanel({ request, controller, fieldBuilder, actionsBuilder, onSubmitted, className }: FormPanelProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(request.fields.map((f) => [f.name, f.defaultValue])));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  function setValue(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function act(outcome: FormOutcome) {
    setSubmitting(true);
    setError(undefined);
    try {
      await controller.submitResponse({ request, response: { outcome, data: { ...values } } });
      onSubmitted?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={className} style={{ padding: 16, borderRadius: 8, border: '1px solid var(--ag-outline-variant, #e2e8f0)' }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{request.title}</div>
      {request.description && <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>{request.description}</div>}

      {request.fields.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {request.fields.map((field) =>
            fieldBuilder ? (
              <div key={field.name}>{fieldBuilder(field, values[field.name], (v) => setValue(field.name, v))}</div>
            ) : (
              <FieldWidget key={field.name} field={field} value={values[field.name]} onChange={(v) => setValue(field.name, v)} />
            ),
          )}
        </div>
      )}

      {error && <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>{error}</div>}

      <div style={{ marginTop: 16 }}>{actionsBuilder ? actionsBuilder(request, (o) => void act(o)) : <DefaultActions request={request} submitting={submitting} onAct={(o) => void act(o)} />}</div>
    </div>
  );
}

// ── Field renderers ───────────────────────────────────────────────────────────

function FieldWidget({ field, value, onChange }: { field: AgFormField; value: unknown; onChange: (value: unknown) => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
        {field.isRequired ? `${field.label} *` : field.label}
      </label>
      <FieldInput field={field} value={value} onChange={onChange} />
      {field.hint && <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{field.hint}</div>}
    </div>
  );
}

const inputStyle = { width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--ag-outline-variant, #e2e8f0)' } as const;

function FieldInput({ field, value, onChange }: { field: AgFormField; value: unknown; onChange: (value: unknown) => void }) {
  switch (field.type) {
    case 'boolean':
      return <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;

    case 'choice': {
      const options = field.options ?? [];
      return (
        <select style={inputStyle} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>
            Select…
          </option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }

    case 'multilineText':
      return <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={4} value={value != null ? String(value) : ''} onChange={(e) => onChange(e.target.value)} />;

    case 'number':
      return <input type="number" style={inputStyle} value={value != null ? String(value) : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;

    case 'date': {
      const iso = value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === 'string' ? value.slice(0, 10) : '';
      return <input type="date" style={inputStyle} value={iso} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)} />;
    }

    case 'file':
    case 'text':
    default:
      return <input type="text" style={inputStyle} value={value != null ? String(value) : ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

// ── Default action buttons ────────────────────────────────────────────────────

function DefaultActions({ request, submitting, onAct }: { request: FormRequest; submitting: boolean; onAct: (outcome: FormOutcome) => void }) {
  const buttonStyle = { padding: '8px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: 'none' } as const;

  if (request.kind === 'approval') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" disabled={submitting} onClick={() => onAct('rejected')} style={{ ...buttonStyle, background: 'none', border: '1px solid #ef4444', color: '#ef4444' }}>
          Reject
        </button>
        <button type="button" disabled={submitting} onClick={() => onAct('approved')} style={{ ...buttonStyle, background: 'var(--ag-primary, #2563eb)', color: 'white' }}>
          Approve
        </button>
      </div>
    );
  }

  if (request.kind === 'notification') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" disabled={submitting} onClick={() => onAct('submitted')} style={{ ...buttonStyle, background: 'var(--ag-primary, #2563eb)', color: 'white' }}>
          Acknowledge
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <button type="button" disabled={submitting} onClick={() => onAct('submitted')} style={{ ...buttonStyle, background: 'var(--ag-primary, #2563eb)', color: 'white' }}>
        Submit
      </button>
    </div>
  );
}
