import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentivityClient } from '../src/client/agentivity-client.js';
import { ConnectionMonitor } from '../src/client/connection-monitor.js';
import { ChatConnectionNotice, describeConnection } from '../src/chat/components/ChatConnectionNotice.js';
import { ChatController } from '../src/chat/chat-controller.js';
import { ChatDiscussion } from '../src/chat/components/ChatDiscussion.js';
import { AgentivityProvider } from '../src/react/AgentivityProvider.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ConnectionMonitor', () => {
  it('goes offline on a failed request, probes on a growing delay and comes back when the server answers', async () => {
    const answers = [false, false, true];
    const probe = vi.fn(async () => answers.shift() ?? true);
    const monitor = new ConnectionMonitor({ probe, delays: [1000, 2000, 4000] });

    monitor.httpFailed('Failed to fetch');
    expect(monitor.getSnapshot()).toMatchObject({ status: 'offline', attempt: 0, reason: 'Failed to fetch' });
    expect(monitor.getSnapshot().nextRetryAt).toBe(Date.now() + 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(monitor.getSnapshot()).toMatchObject({ status: 'offline', attempt: 1, retrying: false });
    expect(monitor.getSnapshot().nextRetryAt).toBe(Date.now() + 2000);

    await vi.advanceTimersByTimeAsync(2000);
    expect(monitor.getSnapshot().attempt).toBe(2);
    expect(monitor.getSnapshot().nextRetryAt).toBe(Date.now() + 4000);

    await vi.advanceTimersByTimeAsync(4000);
    expect(monitor.getSnapshot()).toMatchObject({ status: 'online', attempt: 0 });
    expect(monitor.getSnapshot().recoveredAt).toBeDefined();
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it('is online again as soon as any request gets an answer, and stops probing', async () => {
    const probe = vi.fn(async () => false);
    const monitor = new ConnectionMonitor({ probe, delays: [1000] });
    monitor.httpFailed();
    monitor.httpReachable();

    expect(monitor.getSnapshot().status).toBe('online');
    await vi.advanceTimersByTimeAsync(5000);
    expect(probe).not.toHaveBeenCalled();
  });

  it('keeps the schedule when more requests fail while it is already offline', async () => {
    const monitor = new ConnectionMonitor({ probe: async () => false, delays: [1000, 2000] });
    monitor.httpFailed();
    const next = monitor.getSnapshot().nextRetryAt;
    await vi.advanceTimersByTimeAsync(500);
    monitor.httpFailed('again');

    expect(monitor.getSnapshot().nextRetryAt).toBe(next);
  });

  it('retryNow probes at once', async () => {
    const probe = vi.fn(async () => true);
    const monitor = new ConnectionMonitor({ probe, delays: [60_000] });
    monitor.httpFailed();
    monitor.retryNow();
    await vi.advanceTimersByTimeAsync(0);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(monitor.getSnapshot().status).toBe('online');
  });

  it('follows a stream that is reconnecting, and can retry it', () => {
    const retry = vi.fn();
    const monitor = new ConnectionMonitor();
    monitor.setStream('s1', { offline: true, attempt: 3, nextRetryAt: Date.now() + 12_000, retry });

    expect(monitor.getSnapshot()).toMatchObject({ status: 'offline', attempt: 3 });
    expect(monitor.getSnapshot().nextRetryAt).toBe(Date.now() + 12_000);

    monitor.retryNow();
    expect(retry).toHaveBeenCalledTimes(1);

    monitor.setStream('s1', { offline: false, attempt: 0 });
    expect(monitor.getSnapshot().status).toBe('online');
  });
});

describe('the transport reports to the monitor', () => {
  it('a request that gets no answer makes the client offline; the next answer (even an error) brings it back', async () => {
    let up = false;
    const fetchImpl = vi.fn(async () => {
      if (!up) throw new TypeError('Failed to fetch');
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    });
    const client = new AgentivityClient({ baseUrl: 'https://api.example.com', fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.runs.fetchExecutionStatuses('e1');
    expect(client.connection.getSnapshot()).toMatchObject({ status: 'offline', reason: 'Failed to fetch' });

    up = true;
    await client.runs.fetchExecutionStatuses('e1');
    expect(client.connection.getSnapshot().status).toBe('online');
  });

  it('a gateway error (502/503/504) counts as unreachable', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503, statusText: 'Service Unavailable' }));
    const client = new AgentivityClient({ baseUrl: 'https://api.example.com', fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.runs.fetchExecutionStatuses('e1');
    expect(client.connection.getSnapshot().status).toBe('offline');
    expect(client.connection.getSnapshot().reason).toContain('503');
  });
});

describe('the connection notice', () => {
  it('says the server cannot be reached, counts down to the next attempt and retries on demand', () => {
    const monitor = new ConnectionMonitor({ probe: async () => false, delays: [12_000] });
    render(<ChatConnectionNotice monitor={monitor} />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => monitor.httpFailed('Failed to fetch'));
    expect(screen.getByRole('status').textContent).toContain("Can't reach the server");
    expect(screen.getByRole('status').textContent).toContain('next attempt in 12 s');
    expect(screen.getByRole('status').textContent).toContain('Failed to fetch');

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole('status').textContent).toContain('next attempt in 8 s');

    fireEvent.click(screen.getByText('Retry now'));
  });

  it('says it is back, then goes away', () => {
    const monitor = new ConnectionMonitor();
    render(<ChatConnectionNotice monitor={monitor} />);
    act(() => monitor.httpFailed());
    act(() => monitor.httpReachable());

    expect(screen.getByRole('status').textContent).toContain('Connection restored');
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('words each state', () => {
    const now = 1_000_000;
    expect(describeConnection({ status: 'offline', attempt: 2, retrying: true }, now)?.detail).toBe('Trying to reconnect…');
    expect(describeConnection({ status: 'offline', attempt: 1, retrying: false, nextRetryAt: now + 9_400 }, now)?.secondsLeft).toBe(10);
    expect(describeConnection({ status: 'online', attempt: 0, retrying: false }, now)).toBeUndefined();
  });

  it('appears in a conversation inside an AgentivityProvider, with no wiring from the app', () => {
    const client = new AgentivityClient({ baseUrl: 'https://api.example.com', fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch });
    render(
      <AgentivityProvider client={client}>
        <ChatDiscussion controller={new ChatController()} />
      </AgentivityProvider>,
    );
    act(() => client.connection.httpFailed('Failed to fetch'));

    expect(screen.getByRole('status').textContent).toContain("Can't reach the server");
  });
});
