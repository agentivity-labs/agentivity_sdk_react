import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatController } from '../src/chat/chat-controller.js';
import { ChatDiscussion } from '../src/chat/components/ChatDiscussion.js';
import type { ChatMessage } from '../src/chat/chat-models.js';

const message = (over: Partial<ChatMessage>): ChatMessage => ({ id: 'm1', role: 'assistant', contextId: 'c', threadId: 't1', runId: 'r', text: '', ...over });

describe('a conversation restored from history', () => {
  it('shows the widgets its messages carried, read back from their metadata', () => {
    const controller = new ChatController({ contextId: 'c' });
    controller.addThread({ threadId: 't1', contextId: 'c', runId: 'r', title: 'T', isDefault: true, status: 'active' });
    controller.addMessage(
      't1',
      message({
        metadata: { blocks: [{ type: 'text', text: 'Here is the report' }, { type: 'StatusCard', widgetProps: { title: 'Watch-outs', status: 'warning', message: 'Check the reviews' } }] },
      }),
    );

    expect(controller.messagesFor('t1')[0]!.blocks).toEqual([
      { type: 'text', text: 'Here is the report' },
      { type: 'StatusCard', widgetProps: { title: 'Watch-outs', status: 'warning', message: 'Check the reviews' } },
    ]);
    render(<ChatDiscussion controller={controller} threadId="t1" />);
    expect(screen.getByText('Here is the report')).toBeTruthy();
  });

  it('keeps the blocks a message already has, and leaves a plain message alone', () => {
    const controller = new ChatController({ contextId: 'c' });
    controller.addMessage('t1', message({ id: 'a', blocks: [{ type: 'text', text: 'own' }], metadata: { blocks: [{ type: 'text', text: 'other' }] } }));
    controller.addMessage('t1', message({ id: 'b', text: 'plain' }));

    expect(controller.messagesFor('t1')[0]!.blocks).toEqual([{ type: 'text', text: 'own' }]);
    expect(controller.messagesFor('t1')[1]!.blocks).toBeUndefined();
  });
});
