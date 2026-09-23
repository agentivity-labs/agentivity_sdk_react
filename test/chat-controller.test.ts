import { describe, expect, it } from 'vitest';
import { ChatController } from '../src/chat/chat-controller.js';
import type { AgUiEvent } from '../src/protocol/events.js';

describe('ChatController', () => {
  it('adds a thread and a message via CUSTOM events', () => {
    const controller = new ChatController({ contextId: 'ctx1' });
    controller.feedEvent({ type: 'CUSTOM', name: 'CHAT_THREAD_CREATED', value: { threadId: 't1', title: 'Main', isDefault: true } });
    controller.feedEvent({ type: 'CUSTOM', name: 'CHAT_MESSAGE_RECEIVED', value: { threadId: 't1', messageId: 'm1', role: 'assistant', text: 'Hello' } });

    expect(controller.threads).toEqual([{ threadId: 't1', contextId: 'ctx1', runId: '', title: 'Main', isDefault: true, status: 'active' }]);
    expect(controller.messagesFor('t1')).toHaveLength(1);
    expect(controller.messagesFor('t1')[0]).toMatchObject({ id: 'm1', text: 'Hello', role: 'assistant' });
  });

  it('auto-creates the thread on CHAT_MESSAGE_RECEIVED when no CHAT_THREAD_CREATED arrived', () => {
    const controller = new ChatController({ contextId: 'ctx1' });
    controller.feedEvent({ type: 'CUSTOM', name: 'CHAT_MESSAGE_RECEIVED', value: { threadId: 't1', messageId: 'm1', text: 'Hi' } });
    expect(controller.threads).toHaveLength(1);
    expect(controller.threads[0]!.threadId).toBe('t1');
  });

  it('tracks isAwaitingResponse across RUN_STARTED/RUN_FINISHED', () => {
    const controller = new ChatController();
    expect(controller.isAwaitingResponse).toBe(false);
    controller.feedEvent({ type: 'RUN_STARTED', runId: 'r1' });
    expect(controller.isAwaitingResponse).toBe(true);
    controller.feedEvent({ type: 'RUN_FINISHED', runId: 'r1' });
    expect(controller.isAwaitingResponse).toBe(false);
  });

  it('sets pendingHilGate from an interrupted RUN_FINISHED with reason chat_hil_gate', () => {
    const controller = new ChatController();
    controller.addThread({ threadId: 't1', contextId: '', runId: '', title: '', isDefault: true, status: 'active' });
    controller.feedEvent({
      type: 'RUN_FINISHED',
      runId: 'r1',
      outcome: { kind: 'interrupt', interrupts: [{ id: 'req1', reason: 'chat_hil_gate', message: 'Approve?', metadata: { threadId: 't1', title: 'Approval' } }] },
    });
    expect(controller.pendingHilGate).toEqual({ requestId: 'req1', threadId: 't1', question: 'Approve?', title: 'Approval' });
  });

  it('clears pendingHilGate on CHAT_HIL_RESOLVED', () => {
    const controller = new ChatController();
    controller.setHilGate({ requestId: 'req1', threadId: 't1', question: 'Q', title: 'T' });
    controller.feedEvent({ type: 'CUSTOM', name: 'CHAT_HIL_RESOLVED', value: {} });
    expect(controller.pendingHilGate).toBeUndefined();
  });

  it('accumulates a streamed assistant message from TEXT_MESSAGE_START/CONTENT/END', () => {
    const controller = new ChatController({ contextId: 'ctx1' });
    controller.addThread({ threadId: 't1', contextId: 'ctx1', runId: '', title: '', isDefault: true, status: 'active' });

    const events: AgUiEvent[] = [
      { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hel' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'lo' },
      { type: 'TEXT_MESSAGE_END', messageId: 'm1' },
    ];
    events.forEach((e) => controller.feedEvent(e));

    expect(controller.messagesFor('t1')).toHaveLength(1);
    expect(controller.messagesFor('t1')[0]).toMatchObject({ id: 'm1', text: 'Hello', role: 'assistant' });
  });

  it('routes an unrecognized CUSTOM event to a widget-invocation message', () => {
    const controller = new ChatController();
    controller.addThread({ threadId: 't1', contextId: '', runId: '', title: '', isDefault: true, status: 'active' });
    controller.feedEvent({ type: 'CUSTOM', name: 'ChoiceCard', value: { options: ['a', 'b'] } });

    const messages = controller.messagesFor('t1');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.metadata).toEqual({ widgetType: 'ChoiceCard', widgetProps: { options: ['a', 'b'] } });
  });

  it('clear() resets threads, messages, and the HIL gate', () => {
    const controller = new ChatController();
    controller.addThread({ threadId: 't1', contextId: '', runId: '', title: '', isDefault: true, status: 'active' });
    controller.setHilGate({ requestId: 'r', threadId: 't1', question: 'q', title: 't' });
    controller.clear();
    expect(controller.threads).toEqual([]);
    expect(controller.messagesFor('t1')).toEqual([]);
    expect(controller.pendingHilGate).toBeUndefined();
    expect(controller.isAwaitingResponse).toBe(false);
  });
});
