import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatController } from '../src/chat/chat-controller.js';
import { ChatDiscussion } from '../src/chat/components/ChatDiscussion.js';
import { ApiException } from '../src/client/api-contract.js';
import { RunsApi } from '../src/client/api/runs-api.js';
import { AgentivityHttpCore } from '../src/client/http-core.js';
import { parseSessionStartedResponse } from '../src/client/domain/entity-models.js';
import { parseAgUiEvent } from '../src/protocol/events.js';

const feed = (c: ChatController, json: Record<string, unknown>) => act(() => c.feedEvent(parseAgUiEvent(json)));
const refused = (code: string) => new ApiException({ httpStatus: 409, code, userMessage: 'Refused.' });

async function send(text: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
}

describe('the end of a job', () => {
  it('offers what comes next only once a job is finished, not after a turn', () => {
    const c = new ChatController();
    render(<ChatDiscussion controller={c} onSend={() => undefined} onNewConversation={() => undefined} enableVoice={false} />);

    feed(c, { type: 'RUN_STARTED', runId: 'r1' });
    feed(c, { type: 'RUN_FINISHED', runId: 'r1', outcome: 'success' });
    expect(screen.queryByText('Start another')).toBeNull();

    feed(c, { type: 'RUN_STARTED', runId: 'r2' });
    feed(c, { type: 'RUN_FINISHED', runId: 'r2', outcome: 'success', jobFinished: true });
    expect(screen.getByText('Start another')).toBeTruthy();

    fireEvent.click(screen.getByText('Continue'));
    expect(screen.queryByText('Start another')).toBeNull();
  });

  it('goes when the next run starts, and a new run of a conversation starts its team afresh', () => {
    const c = new ChatController();
    feed(c, { type: 'RUN_STARTED', runId: 'r1', executionId: 'e1' });
    feed(c, { type: 'STEP_STARTED', stepName: 's', memberEntityId: 'a', executionId: 'e1' });
    feed(c, { type: 'RUN_FINISHED', runId: 'r1', outcome: 'success', jobFinished: true, executionId: 'e1' });
    expect(c.jobFinished).toBe(true);

    feed(c, { type: 'RUN_STARTED', runId: 'r2', executionId: 'e1' });
    expect(c.jobFinished).toBe(false);
    expect(c.memberStatuses.size).toBe(0);
  });
});

describe('a conversation that goes on', () => {
  it('follows the stream the platform gives, from where it stood', () => {
    const started = parseSessionStartedResponse({ executionId: 'e', streamId: 's', runId: 'r', state: 'active', streamUrl: '/api/v1/streams/s/events?after=17' });
    expect(started.streamUrl).toBe('/api/v1/streams/s/events?after=17');
  });
});

describe('a message sent while the turn before it finishes', () => {
  const busy = (waiting: boolean) =>
    new Response(JSON.stringify({ httpStatus: 409, code: 'execution_busy', userMessage: 'Busy.', context: { executionId: 'e', waiting } }), { status: 409, headers: { 'content-type': 'application/json' } });
  const started = () => new Response(JSON.stringify({ executionId: 'e', streamId: 's', runId: 'r', state: 'active' }), { status: 200, headers: { 'content-type': 'application/json' } });

  it('waits for the turn and is sent again, once', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn().mockResolvedValueOnce(busy(false)).mockResolvedValueOnce(busy(false)).mockResolvedValueOnce(started());
      const runs = new RunsApi(new AgentivityHttpCore({ baseUrl: 'http://x/', fetchImpl }));
      const sending = runs.startExecution({ entityId: 't', input: 'And tomorrow?', executionId: 'e' });
      await vi.advanceTimersByTimeAsync(5_000);
      expect((await sending).executionId).toBe('e');
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is refused at once when the turn waits for an answer, and for a new conversation', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(busy(true)));
    const runs = new RunsApi(new AgentivityHttpCore({ baseUrl: 'http://x/', fetchImpl }));
    await expect(runs.startExecution({ entityId: 't', input: 'Hi', executionId: 'e' })).rejects.toMatchObject({ code: 'execution_busy' });
    await expect(runs.startExecution({ entityId: 't', input: 'Hi' })).rejects.toMatchObject({ code: 'execution_busy' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after the wait, and the chat keeps the text', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(busy(false)));
      const runs = new RunsApi(new AgentivityHttpCore({ baseUrl: 'http://x/', fetchImpl }));
      const sending = runs.startExecution({ entityId: 't', input: 'Hi', executionId: 'e', waitForTurnMs: 4_000 });
      const failed = expect(sending).rejects.toMatchObject({ code: 'execution_busy' });
      await vi.advanceTimersByTimeAsync(5_000);
      await failed;
      expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a message that is refused', () => {
  it('shows that the conversation has ended, and only a yes starts anything', async () => {
    const c = new ChatController();
    const onNew = vi.fn();
    const onSend = vi.fn().mockRejectedValue(refused('execution_ended'));
    render(<ChatDiscussion controller={c} onSend={onSend} onNewConversation={onNew} enableVoice={false} />);

    await send('Still there?');

    expect(await screen.findByText('This conversation has ended. Start a new one?')).toBeTruthy();
    expect(onNew).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Start a new one'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('keeps the text in the input while a turn goes on', async () => {
    const c = new ChatController();
    render(<ChatDiscussion controller={c} onSend={() => Promise.reject(refused('execution_busy'))} enableVoice={false} />);

    await send('Faster!');

    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Faster!'));
  });

  it('goes with the person into a new conversation', async () => {
    const c = new ChatController();
    const onNew = vi.fn();
    render(<ChatDiscussion controller={c} onSend={() => Promise.reject(refused('execution_ended'))} onNewConversation={onNew} enableVoice={false} />);

    await send('Still there?');
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Still there?'));
    fireEvent.click(screen.getByText('Start a new one'));

    expect(onNew).toHaveBeenCalledWith('Still there?');
  });

  it('is told by an app that catches the failure itself', () => {
    const c = new ChatController();
    expect(c.noteSendRefused(refused('execution_ended'))).toBe('ended');
    expect(c.conversationEnded).toBe(true);
    expect(c.noteSendRefused(new Error('boom'))).toBeUndefined();
  });
});
