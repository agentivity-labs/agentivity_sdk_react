import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatDiscussion } from '../src/chat/components/ChatDiscussion.js';
import { ChatController } from '../src/chat/chat-controller.js';

describe('ChatDiscussion', () => {
  it('renders messages fed into the controller and calls onSend for a plain message', async () => {
    const controller = new ChatController({ contextId: 'ctx1' });
    controller.feedEvent({ type: 'CUSTOM', name: 'CHAT_THREAD_CREATED', value: { threadId: 't1', isDefault: true } });
    controller.feedEvent({ type: 'CUSTOM', name: 'CHAT_MESSAGE_RECEIVED', value: { threadId: 't1', messageId: 'm1', role: 'assistant', text: 'Hi, how can I help?' } });

    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatDiscussion controller={controller} onSend={onSend} />);

    expect(screen.getByText('Hi, how can I help?')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Type a message…'), 'hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello', []);
  });

  it('routes a submission to onHilResponse instead of onSend while a HIL gate is pending', async () => {
    const controller = new ChatController({ contextId: 'ctx1' });
    controller.addThread({ threadId: 't1', contextId: 'ctx1', runId: '', title: '', isDefault: true, status: 'active' });
    controller.setHilGate({ requestId: 'req1', threadId: 't1', question: 'Approve?', title: 'Approval' });

    const onSend = vi.fn();
    const onHilResponse = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ChatDiscussion controller={controller} onSend={onSend} onHilResponse={onHilResponse} hilInputHint="Your answer…" />);

    await user.type(screen.getByPlaceholderText('Your answer…'), 'yes{Enter}');
    expect(onHilResponse).toHaveBeenCalledWith({ requestId: 'req1', threadId: 't1', question: 'Approve?', title: 'Approval' }, 'yes', 'text');
    expect(onSend).not.toHaveBeenCalled();
  });
});
