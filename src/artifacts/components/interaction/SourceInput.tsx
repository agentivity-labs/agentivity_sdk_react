import { useRef, useState, type CSSProperties } from 'react';
import { useOptionalAgentivityClient } from '../../../react/AgentivityProvider.js';
import { ArtifactCard } from '../ArtifactCard.js';
import type { ChartProps } from '../charts/BarChart.js';

type Source = 'upload' | 'url' | 'paste';

const ALL_SOURCES: readonly Source[] = ['upload', 'url', 'paste'];
const SOURCE_LABEL: Record<Source, string> = { upload: 'Upload', url: 'Link', paste: 'Paste' };
function asSources(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return [...ALL_SOURCES];
  const picked = ALL_SOURCES.filter((s) => raw.includes(s));
  return picked.length > 0 ? picked : [...ALL_SOURCES];
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Document / link / pasted-text intake widget. It only *collects* — it never reads a document itself.
 * It calls `props.__onSubmit` with one small JSON envelope, so a workflow or agent can branch on `kind`
 * (a scrape node for a link, a document-extraction node for a file, the text as is) without guessing what
 * it was handed:
 * ```
 * {"kind":"file","fileId":"…","name":"resume.pdf","mime":"application/pdf","size":84012}
 * {"kind":"url","url":"https://…"}
 * {"kind":"text","content":"…"}
 * ```
 * A file is uploaded to the platform first (`client.uploads.upload`, so the widget needs an
 * `AgentivityProvider`); the reply carries only its `fileId`, which a `document.extract_text` node reads back.
 *
 * Agent props: `{ title, description?, sources?: ('upload'|'url'|'paste')[], accept?, maxSizeMb?, placeholder?, submitLabel? }`.
 * `accept` is a comma-separated extension list (default `.pdf,.docx,.txt,.md`); `maxSizeMb` defaults to 2.
 */
export function SourceInput({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Add a document';
  const description = typeof props['description'] === 'string' ? props['description'] : undefined;
  const sources = asSources(props['sources']);
  const accept = typeof props['accept'] === 'string' && props['accept'].trim() ? props['accept'].trim() : '.pdf,.docx,.txt,.md';
  const maxSizeMb = typeof props['maxSizeMb'] === 'number' && props['maxSizeMb'] > 0 ? props['maxSizeMb'] : 2;
  const placeholder = typeof props['placeholder'] === 'string' ? props['placeholder'] : undefined;
  const submitLabel = typeof props['submitLabel'] === 'string' ? props['submitLabel'] : 'Continue';
  const onSubmit = typeof props['__onSubmit'] === 'function' ? (props['__onSubmit'] as (response: string) => void) : undefined;

  const [source, setSource] = useState<Source>(sources[0]!);
  const [file, setFile] = useState<File | undefined>();
  const [url, setUrl] = useState('');
  const [pasted, setPasted] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const client = useOptionalAgentivityClient();
  const [submitted, setSubmitted] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptedExtensions = accept.split(',').map((e) => e.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
  const acceptLabel = acceptedExtensions.map((e) => e.toUpperCase()).join(', ');

  function pick(candidate: File | undefined) {
    if (!candidate || submitted) return;
    if (acceptedExtensions.length > 0 && !acceptedExtensions.includes(extensionOf(candidate.name))) {
      setError(`${candidate.name} is not a supported file. Use ${acceptLabel}.`);
      return;
    }
    if (candidate.size > maxSizeMb * 1024 * 1024) {
      setError(`${candidate.name} is ${formatSize(candidate.size)} — the limit is ${maxSizeMb} MB.`);
      return;
    }
    setError(undefined);
    setFile(candidate);
  }

  const ready =
    source === 'upload' ? !!file : source === 'url' ? isValidUrl(url.trim()) : pasted.trim().length > 0;

  async function submit() {
    if (!onSubmit || submitted || busy || !ready) return;
    setBusy(true);
    setError(undefined);
    try {
      if (source === 'upload' && file) {
        if (!client) throw new Error('Uploading is not available here.');
        const uploaded = await client.uploads.upload(file, file.name);
        setSubmitted(`${uploaded.name} · ${formatSize(uploaded.size)}`);
        onSubmit(JSON.stringify({ kind: 'file', fileId: uploaded.fileId, name: uploaded.name, mime: uploaded.mimeType, size: uploaded.size }));
      } else if (source === 'url') {
        const value = url.trim();
        setSubmitted(value);
        onSubmit(JSON.stringify({ kind: 'url', url: value }));
      } else {
        const value = pasted.trim();
        setSubmitted(`Pasted text · ${value.length.toLocaleString()} characters`);
        onSubmit(JSON.stringify({ kind: 'text', content: value }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload the file.');
    } finally {
      setBusy(false);
    }
  }

  const border = '1px solid var(--ag-outline-variant, #e2e8f0)';
  const field: CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '9px 11px', borderRadius: 8, border, background: 'var(--ag-surface-container-low, transparent)', color: 'inherit', font: 'inherit' };
  const disabled = !!submitted;

  return (
    <ArtifactCard title={title} type="Source">
      {description && <p style={{ fontSize: 13, opacity: 0.75, margin: '0 0 12px' }}>{description}</p>}

      {sources.length > 1 && (
        <div role="tablist" style={{ display: 'flex', gap: 2, padding: 3, marginBottom: 12, borderRadius: 9, border, background: 'var(--ag-surface-container-low, #f8fafc)' }}>
          {sources.map((s) => {
            const active = s === source;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => {
                  setSource(s);
                  setError(undefined);
                }}
                style={{ flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 500, borderRadius: 7, border: 'none', cursor: disabled ? 'default' : 'pointer', background: active ? 'var(--ag-surface, #ffffff)' : 'transparent', color: 'inherit', opacity: active ? 1 : 0.6, boxShadow: active ? '0 0 0 1px var(--ag-outline-variant, #e2e8f0)' : 'none' }}
              >
                {SOURCE_LABEL[s]}
              </button>
            );
          })}
        </div>
      )}

      {source === 'upload' && (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Choose a file"
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '22px 12px', borderRadius: 10, textAlign: 'center', cursor: disabled ? 'default' : 'pointer', border: `1.5px dashed ${dragging || file ? 'var(--ag-primary, #2563eb)' : 'var(--ag-outline, #94a3b8)'}`, background: dragging ? 'var(--ag-primary-container, #dbeafe)' : 'var(--ag-surface-container-low, transparent)' }}
        >
          <input ref={inputRef} type="file" accept={accept} hidden onChange={(e) => pick(e.target.files?.[0])} />
          {file ? (
            <>
              <span style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all' }}>{file.name}</span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>{formatSize(file.size)}{disabled ? '' : ' · click to replace'}</span>
            </>
          ) : (
            <>
              <span aria-hidden style={{ fontSize: 20, lineHeight: 1, opacity: 0.6 }}>⬆</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Drop a file here or <span style={{ color: 'var(--ag-primary, #2563eb)', textDecoration: 'underline' }}>browse</span></span>
              <span style={{ fontSize: 11, opacity: 0.55 }}>{acceptLabel} · up to {maxSizeMb} MB</span>
            </>
          )}
        </div>
      )}

      {source === 'url' && (
        <input
          type="url"
          inputMode="url"
          placeholder={placeholder ?? 'https://…'}
          disabled={disabled}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          style={field}
        />
      )}

      {source === 'paste' && (
        <textarea
          rows={6}
          placeholder={placeholder ?? 'Paste the text here'}
          disabled={disabled}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          style={{ ...field, resize: 'vertical', lineHeight: 1.45 }}
        />
      )}

      {error && <p role="alert" style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--ag-error, #dc2626)' }}>{error}</p>}
      {submitted && <p style={{ fontSize: 12, margin: '8px 0 0', opacity: 0.65 }}>Sent — {submitted}</p>}

      <button
        type="button"
        disabled={disabled || busy || !ready}
        onClick={() => void submit()}
        style={{ width: '100%', marginTop: 12, padding: '9px 0', borderRadius: 6, border: 'none', background: 'var(--ag-primary, #2563eb)', color: 'var(--ag-on-primary, white)', fontSize: 13, cursor: disabled || !ready ? 'default' : 'pointer', opacity: disabled || busy || !ready ? 0.5 : 1 }}
      >
        {busy ? 'Uploading…' : submitLabel}
      </button>
    </ArtifactCard>
  );
}
