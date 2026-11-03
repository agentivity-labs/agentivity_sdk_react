import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatController } from '../src/chat/chat-controller.js';
import { ChatDiscussion } from '../src/chat/components/ChatDiscussion.js';
import { AgentivityClient } from '../src/client/agentivity-client.js';
import { parseAgUiEvent } from '../src/protocol/events.js';
import { AgentivityProvider } from '../src/react/AgentivityProvider.js';

const feed = (c: ChatController, json: Record<string, unknown>) => act(() => c.feedEvent(parseAgUiEvent(json)));

function clientAt(state: string) {
  const client = new AgentivityClient({ baseUrl: 'https://example.test' } as never);
  const statuses = vi.spyOn(client.runs, 'fetchExecutionStatuses').mockResolvedValue({ executionState: state, nodes: new Map(), members: new Map(), memberSteps: new Map() });
  vi.spyOn(client.runs, 'fetchExecution').mockResolvedValue(undefined);
  vi.spyOn(client.conversations, 'fetchExecutionThreads').mockResolvedValue([{ threadId: 't', executionId: 'e1', title: '', isDefault: true, status: 'active' }]);
  vi.spyOn(client.conversations, 'fetchExecutionThreadMessages').mockResolvedValue([
    { messageId: 'm1', threadId: 't', authorType: 'user', text: 'Plan my week' },
    { messageId: 'm2', threadId: 't', authorType: 'agent', authorName: 'Head Coach', text: 'Here is your week.' },
  ]);
  const pending = vi.spyOn(client.runs, 'fetchPendingHil').mockResolvedValue({ executionId: 'e1', count: 1, requests: [{ requestId: 'q1', question: 'Happy with it?' }] });
  return { client, statuses, pending };
}

async function startTurn(c: ChatController) {
  feed(c, { type: 'CUSTOM', name: 'CHAT_MESSAGE_RECEIVED', value: { threadId: 't', messageId: 'm1', role: 'user', text: 'Plan my week' } });
  feed(c, { type: 'RUN_STARTED', runId: 'r1', executionId: 'e1' });
}

describe('a chat whose stream was lost during a turn', () => {
  afterEach(() => vi.useRealTimers());

  it('stops looking at work and reads back what was written, once the execution says the turn has ended', async () => {
    vi.useFakeTimers();
    const { client, statuses } = clientAt('completed');
    const c = new ChatController();
    render(
      <AgentivityProvider client={client}>
        <ChatDiscussion controller={c} onSend={() => undefined} showTeamProgress={false} enableVoice={false} />
      </AgentivityProvider>,
    );
    await startTurn(c);
    expect(statuses).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(21_000));
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(c.isAwaitingResponse).toBe(false);
    expect(screen.getByText('Here is your week.')).toBeTruthy();
    expect(c.messagesFor('t').map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('gets back the question it waits on', async () => {
    vi.useFakeTimers();
    const { client, pending } = clientAt('waitingforinput');
    const c = new ChatController();
    render(
      <AgentivityProvider client={client}>
        <ChatDiscussion controller={c} onSend={() => undefined} showTeamProgress={false} enableVoice={false} />
      </AgentivityProvider>,
    );
    await startTurn(c);
    await act(() => vi.advanceTimersByTimeAsync(21_000));
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(pending).toHaveBeenCalledWith('e1');
    expect(c.pendingHilGate).toMatchObject({ requestId: 'q1', threadId: 't', question: 'Happy with it?' });
  });

  it('leaves alone a turn that is still at work', async () => {
    vi.useFakeTimers();
    const { client } = clientAt('running');
    const c = new ChatController();
    render(
      <AgentivityProvider client={client}>
        <ChatDiscussion controller={c} onSend={() => undefined} showTeamProgress={false} enableVoice={false} />
      </AgentivityProvider>,
    );
    await startTurn(c);
    await act(() => vi.advanceTimersByTimeAsync(40_000));

    expect(c.isAwaitingResponse).toBe(true);
  });
});
