import { useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AgentRunController } from '../agent/agent-run-controller.js';
import type { AgentRunStatus, AgentRunStreamEvent } from '../agent/agent-run-models.js';
import { RunStatusBadge } from './RunStatusBadge.js';

export interface RunPanelProps {
  controller: AgentRunController;
  inputHint?: string;
  /** Override rendering of a single stream event. */
  eventBuilder?: (event: AgentRunStreamEvent) => ReactNode;
  /** Override rendering of the final result. */
  resultBuilder?: (result: AgentRunStatus) => ReactNode;
  className?: string;
}

/**
 * Full run panel: input field, start/cancel button, event log, result — port
 * of `AgUiRunPanel`.
 */
export function RunPanel({ controller, inputHint = 'Enter input for the agent…', eventBuilder, resultBuilder, className }: RunPanelProps) {
  const [input, setInput] = useState('');
  const isActive = useSyncExternalStore(controller.subscribe, () => controller.isActive);
  const runId = useSyncExternalStore(controller.subscribe, () => controller.runId);
  const errorMessage = useSyncExternalStore(controller.subscribe, () => controller.errorMessage);
  const events = useSyncExternalStore(controller.subscribe, () => controller.events);
  const result = useSyncExternalStore(controller.subscribe, () => controller.result);

  function start(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setInput('');
    void controller.startRun({ input: trimmed });
  }

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px' }}>
        <RunStatusBadge controller={controller} />
        <span style={{ flex: 1 }} />
        {isActive && (
          <button type="button" onClick={() => void controller.cancelRun()} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>
            ■ Cancel
          </button>
        )}
        {!isActive && runId != null && (
          <button type="button" onClick={() => controller.reset()} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>
            ↻ Reset
          </button>
        )}
      </div>

      {!isActive && (
        <div style={{ display: 'flex', gap: 8, padding: '0 16px' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start(input)}
            placeholder={inputHint}
            style={{ flex: 1, fontSize: 13, padding: '8px 10px', border: '1px solid var(--ag-outline-variant, #e2e8f0)', borderRadius: 4 }}
          />
          <button type="button" onClick={() => start(input)} style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: 'var(--ag-primary, #2563eb)', color: 'white', cursor: 'pointer' }}>
            Run
          </button>
        </div>
      )}

      {errorMessage && <div style={{ padding: '4px 16px', color: '#ef4444', fontSize: 13 }}>{errorMessage}</div>}

      {events.length > 0 && (
        <div style={{ borderTop: '1px solid var(--ag-outline-variant, #e2e8f0)', padding: '4px 16px', overflowY: 'auto' }}>
          {events.map((event, i) => (eventBuilder ? <div key={i}>{eventBuilder(event)}</div> : <EventTile key={i} event={event} />))}
        </div>
      )}

      {result && (
        <div style={{ borderTop: '1px solid var(--ag-outline-variant, #e2e8f0)', padding: 16 }}>
          {resultBuilder ? resultBuilder(result) : <DefaultResult result={result} />}
        </div>
      )}
    </div>
  );
}

function EventTile({ event }: { event: AgentRunStreamEvent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', fontSize: 11 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', opacity: 0.5 }} />
      {event.eventName}
    </div>
  );
}

function DefaultResult({ result }: { result: AgentRunStatus }) {
  const isOk = result.state === 'completed';
  return (
    <div style={{ padding: 12, borderRadius: 8, background: isOk ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: isOk ? '#16a34a' : '#ef4444' }}>{isOk ? 'Completed' : 'Failed'}</div>
      {result.content && <div style={{ marginTop: 4 }}>{result.content}</div>}
      {result.error && <div style={{ marginTop: 4, color: '#ef4444', fontSize: 13 }}>{result.error}</div>}
    </div>
  );
}
