import { describe, expect, it } from 'vitest';
import { agUiEventParser, parseAgUiEvent } from '../src/protocol/events.js';

describe('parseAgUiEvent', () => {
  it('parses RUN_STARTED', () => {
    const event = parseAgUiEvent({ type: 'RUN_STARTED', runId: 'r1', executionId: 'e1', timestamp: 123 });
    expect(event).toEqual({ type: 'RUN_STARTED', runId: 'r1', executionId: 'e1', timestamp: 123, threadId: undefined, parentRunId: undefined, input: undefined });
  });

  it('parses RUN_FINISHED with an interrupt outcome', () => {
    const event = parseAgUiEvent({
      type: 'RUN_FINISHED',
      runId: 'r1',
      outcome: { type: 'interrupt', interrupts: [{ id: 'i1', reason: 'needs_input' }] },
    });
    expect(event.type).toBe('RUN_FINISHED');
    if (event.type === 'RUN_FINISHED') {
      expect(event.outcome).toEqual({ kind: 'interrupt', interrupts: [{ id: 'i1', reason: 'needs_input', message: undefined, toolCallId: undefined, responseSchema: undefined, expiresAt: undefined, metadata: undefined }] });
    }
  });

  it('parses legacy REASONING_* wire names into spec-aligned THINKING_* types', () => {
    const event = parseAgUiEvent({ type: 'REASONING_START', messageId: 'm1' });
    expect(event).toMatchObject({ type: 'THINKING_START', messageId: 'm1' });
  });

  it('tolerates TOOL_CALL_ARGS_DELTA as an alias for TOOL_CALL_ARGS', () => {
    const event = parseAgUiEvent({ type: 'TOOL_CALL_ARGS_DELTA', toolCallId: 't1', delta: '{"x":1}' });
    expect(event).toMatchObject({ type: 'TOOL_CALL_ARGS', toolCallId: 't1', delta: '{"x":1}' });
  });

  it('falls back to UnknownEvent for an unrecognized type', () => {
    const event = parseAgUiEvent({ type: 'SOMETHING_NEW', foo: 'bar' });
    expect(event).toMatchObject({ type: 'UNKNOWN', wireType: 'SOMETHING_NEW', raw: { type: 'SOMETHING_NEW', foo: 'bar' } });
  });
});

describe('agUiEventParser', () => {
  it('returns undefined for empty or [DONE] data', () => {
    expect(agUiEventParser('message', undefined, undefined)).toBeUndefined();
    expect(agUiEventParser('message', undefined, '[DONE]')).toBeUndefined();
  });

  it('uses the SSE event name as the type when the payload omits it', () => {
    const event = agUiEventParser('RUN_STARTED', '1', JSON.stringify({ runId: 'r1' }));
    expect(event).toMatchObject({ type: 'RUN_STARTED', runId: 'r1' });
  });

  it('returns undefined on invalid JSON rather than throwing', () => {
    expect(agUiEventParser('message', undefined, 'not json')).toBeUndefined();
  });
});
