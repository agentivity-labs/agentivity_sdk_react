import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentivityClient } from '../src/client/agentivity-client.js';
import { SlowCalls } from '../src/client/slow-calls.js';
import { WaitNotice, WaitOverlay } from '../src/chat/components/WaitNotice.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a call that waits', () => {
  it('is said past a few seconds, and no longer once answered', async () => {
    // A workspace that wakes up: its gateway holds the call 45 seconds, then it answers.
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })), 45_000)));
    const client = new AgentivityClient({ baseUrl: 'https://acme.agentivity.app', fetchImpl });

    const call = client.httpCore.get('/api/v1/workflows');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(client.waiting.getSnapshot()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(client.waiting.getSnapshot()).toBeDefined();

    await vi.advanceTimersByTimeAsync(41_000);
    await call;
    expect(client.waiting.getSnapshot()).toBeUndefined();
  });
});

describe('a workspace that is starting', () => {
  it('is waited for, not said unreachable', async () => {
    const answers = [503, 503, 200];
    const fetchImpl = vi.fn(async () => {
      const status = answers.shift() ?? 200;
      return new Response(status === 200 ? '[]' : '', { status, headers: { 'content-type': 'application/json', 'retry-after': '1' } });
    });
    const client = new AgentivityClient({ baseUrl: 'https://acme.agentivity.app', fetchImpl });
    const seen: string[] = [];
    client.connection.subscribe(() => seen.push(client.connection.getSnapshot().status));

    const call = client.httpCore.get('/api/v1/workflows');
    await vi.advanceTimersByTimeAsync(3_000);
    await call;

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(seen).not.toContain('offline');
  });
});

describe('WaitNotice', () => {
  it('says a moment, then almost there, then longer than usual, and goes', async () => {
    const waiting = new SlowCalls(1_000);
    let answer!: () => void;
    const call = waiting.follow(() => new Promise<void>((resolve) => (answer = resolve)));
    const onRetry = vi.fn();
    render(
      <WaitOverlay waiting={waiting} onRetry={onRetry}>
        <p>the app</p>
      </WaitOverlay>,
    );
    expect(screen.queryByText('Just a moment…')).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByText('Just a moment…')).toBeTruthy();
    expect(screen.getByText('Getting things ready.')).toBeTruthy();
    expect(screen.getByText('the app')).toBeTruthy();

    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.getByText('Almost there…')).toBeTruthy();

    await act(() => vi.advanceTimersByTimeAsync(45_000));
    expect(screen.getByText('Taking a bit longer than usual.')).toBeTruthy();
    screen.getByText('Try again').click();
    expect(onRetry).toHaveBeenCalled();

    await act(async () => {
      answer();
      await call;
    });
    expect(screen.queryByText('Just a moment…')).toBeNull();
  });

  it('says it in the words of the app', async () => {
    const waiting = new SlowCalls(0);
    void waiting.follow(() => new Promise<void>(() => {}));
    render(<WaitNotice waiting={waiting} texts={{ title: 'Un instant…', detail: 'On prépare tout.' }} />);
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByText('Un instant…')).toBeTruthy();
    expect(screen.getByText('On prépare tout.')).toBeTruthy();
  });
});

describe('AgentivityProvider', () => {
  it('shows the wait of its client by itself, unless told not to', async () => {
    const { AgentivityProvider } = await import('../src/react/AgentivityProvider.js');
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const client = new AgentivityClient({ baseUrl: 'https://acme.agentivity.app', fetchImpl });
    const view = render(
      <AgentivityProvider client={client}>
        <p>the app</p>
      </AgentivityProvider>,
    );
    void client.httpCore.get('/api/v1/workflows');
    await act(() => vi.advanceTimersByTimeAsync(3_500));
    expect(screen.getByText('Just a moment…')).toBeTruthy();
    view.unmount();

    render(
      <AgentivityProvider client={client} waitNotice={false}>
        <p>the app</p>
      </AgentivityProvider>,
    );
    expect(screen.queryByText('Just a moment…')).toBeNull();
  });
});
