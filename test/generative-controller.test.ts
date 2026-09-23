import { describe, expect, it } from 'vitest';
import { AgUiGenerativeController } from '../src/ag-ui/agent/generative-controller.js';
import type { AgUiEvent } from '../src/protocol/events.js';

describe('AgUiGenerativeController', () => {
  it('accumulates a streamed text item', () => {
    const controller = new AgUiGenerativeController();
    const events: AgUiEvent[] = [
      { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hel' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'lo' },
      { type: 'TEXT_MESSAGE_END', messageId: 'm1' },
    ];
    events.forEach(controller.feedEvent);

    expect(controller.items).toHaveLength(1);
    expect(controller.items[0]).toMatchObject({ kind: 'text', text: 'Hello', isStreaming: false });
  });

  it('resolves a tool call to a widget component when registered', () => {
    const controller = new AgUiGenerativeController({ widgetRegistry: { WeatherCard: () => null } });
    const events: AgUiEvent[] = [
      { type: 'TOOL_CALL_START', toolCallId: 't1', toolCallName: 'WeatherCard' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 't1', delta: '{"city":"Paris"}' },
      { type: 'TOOL_CALL_END', toolCallId: 't1' },
    ];
    events.forEach(controller.feedEvent);

    expect(controller.items).toHaveLength(1);
    expect(controller.items[0]).toMatchObject({ kind: 'component', component: 'WeatherCard', props: { city: 'Paris' } });
  });

  it('leaves an unregistered tool call as a running toolCall item', () => {
    const controller = new AgUiGenerativeController();
    const events: AgUiEvent[] = [
      { type: 'TOOL_CALL_START', toolCallId: 't1', toolCallName: 'search' },
      { type: 'TOOL_CALL_END', toolCallId: 't1' },
      { type: 'TOOL_CALL_RESULT', messageId: 'm1', toolCallId: 't1', content: 'found 3 results' },
    ];
    events.forEach(controller.feedEvent);

    expect(controller.items).toHaveLength(1);
    expect(controller.items[0]).toMatchObject({ kind: 'toolCall', status: 'completed', result: 'found 3 results' });
  });

  it('sets a HIL gate with an injected QuestionForm on ask_human', () => {
    const controller = new AgUiGenerativeController();
    controller.feedEvent({
      type: 'CUSTOM',
      name: 'HIL_GATE_REACHED',
      value: { requestId: 'r1', threadId: 't1', questionsToAsk: ['What is your budget?'], hilSource: 'ask_human' },
    });

    expect(controller.pendingHilGate).toMatchObject({ requestId: 'r1', threadId: 't1' });
    expect(controller.items).toHaveLength(1);
    expect(controller.items[0]).toMatchObject({ kind: 'component', component: 'QuestionForm' });
  });

  it('clears items and pending state on clear()', () => {
    const controller = new AgUiGenerativeController();
    controller.feedEvent({ type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' });
    controller.clear();
    expect(controller.items).toEqual([]);
  });
});
