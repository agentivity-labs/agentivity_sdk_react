import { describe, expect, it, vi } from 'vitest';
import { AgentivityHttpCore } from '../src/client/http-core.js';
import { RunsApi } from '../src/client/api/runs-api.js';
import { ConversationsApi } from '../src/client/api/conversations-api.js';
import { AgentivityPlatformConnector } from '../src/ag-ui/connectors/agentivity-platform-connector.js';
import { AgentivityConnector } from '../src/ag-ui/connectors/agentivity-connector.js';

// What the SDK asks the platform when a person answers a question or writes in the conversation of an execution. An
// application only knows its execution: it names the question it answers, never a run.

const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The platform, as far as these tests need it: it notes every call, and answers as it does. */
function platform() {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname, body });
    const path = url.pathname;
    if (method === 'POST' && path === '/api/v1/executions') {
      return jsonResponse({ executionId: 'exec-1', runId: 'run-1', streamId: 'stream-1', streamUrl: '/api/v1/streams/stream-1/events', entityId: 'team-1', entityKind: 'team', state: 'active' });
    }
    if (path.endsWith('/respond')) return jsonResponse({ executionId: 'exec-1', runId: 'run-of-the-question', requestId: 'question-2', threadId: 'thread-1', messageId: 'message-9', state: 'resumed' });
    if (method === 'POST' && path.endsWith('/messages')) return jsonResponse({ executionId: 'exec-1', threadId: 'thread-1', messageId: 'message-10' });
    if (method === 'GET' && path === '/api/v1/executions/exec-1/threads') {
      return jsonResponse([
        { threadId: 'thread-0', title: 'Side', isDefault: false, status: 'Active', createdAt: '2026-10-15T10:00:00Z' },
        { threadId: 'thread-1', title: 'Main', isDefault: true, status: 'Active', createdAt: '2026-10-15T10:00:00Z' },
      ]);
    }
    if (method === 'GET' && path === '/api/v1/executions/exec-1/threads/thread-1/messages') return jsonResponse([{ messageId: 'message-1', threadId: 'thread-1', authorType: 'User', text: 'Hello', createdAt: '2026-10-15T10:00:00Z' }]);
    if (method === 'POST' && path === '/api/v1/runs/run-1/cancel') return jsonResponse({ runId: 'run-1', status: 'cancelled' });
    return jsonResponse({}, 404);
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe('the client', () => {
  it('answers a question of the execution by naming it', async () => {
    const p = platform();
    const result = await new RunsApi(new AgentivityHttpCore({ baseUrl: 'http://platform.test', fetchImpl: p.fetchImpl })).submitHilResponse({ executionId: 'exec-1', requestId: 'question-2', response: 'Blue', source: 'widget' });

    expect(p.calls).toEqual([{ method: 'POST', path: '/api/v1/executions/exec-1/respond', body: { requestId: 'question-2', response: 'Blue', source: 'widget' } }]);
    expect(result.runId).toBe('run-of-the-question');
    expect(result.threadId).toBe('thread-1');
    expect(result.state).toBe('resumed');
  });

  it('writes a message in a conversation of the execution', async () => {
    const p = platform();
    const written = await new ConversationsApi(new AgentivityHttpCore({ baseUrl: 'http://platform.test', fetchImpl: p.fetchImpl })).postMessage({ executionId: 'exec-1', threadId: 'thread-1', text: 'Hello', authorName: 'Ann' });

    expect(p.calls).toEqual([{ method: 'POST', path: '/api/v1/executions/exec-1/threads/thread-1/messages', body: { text: 'Hello', authorName: 'Ann' } }]);
    expect(written.messageId).toBe('message-10');
  });
});

describe('the AG-UI connector', () => {
  const connector = (p: ReturnType<typeof platform>) => new AgentivityPlatformConnector({ baseUrl: 'http://platform.test', authToken: 'token', fetchImpl: p.fetchImpl });

  it('starts an execution', async () => {
    const p = platform();
    const handle = await connector(p).startRun('team-1', 'Plan a trip');

    expect(p.calls[0]).toMatchObject({ method: 'POST', path: '/api/v1/executions', body: { entityId: 'team-1' } });
    expect(handle.executionId).toBe('exec-1');
  });

  it('answers a question of the execution by naming it', async () => {
    const p = platform();
    await connector(p).respond('exec-1', { requestId: 'question-2', responseText: 'Blue' });

    expect(p.calls).toEqual([{ method: 'POST', path: '/api/v1/executions/exec-1/respond', body: { requestId: 'question-2', response: 'Blue' } }]);
  });

  it('writes a message in the main conversation of the execution when none is named', async () => {
    const p = platform();
    await connector(p).sendMessage('exec-1', 'Hello');

    expect(p.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/v1/executions/exec-1/threads', 'POST /api/v1/executions/exec-1/threads/thread-1/messages']);
    expect(p.calls[1]!.body).toEqual({ text: 'Hello' });
  });

  it('reads the conversations of the execution', async () => {
    const p = platform();
    const threads = await connector(p).listThreads('exec-1');
    const messages = await connector(p).listMessages('exec-1', 'thread-1');

    expect(threads.map((t) => t.threadId)).toEqual(['thread-0', 'thread-1']);
    expect(messages[0]!.text).toBe('Hello');
  });
});

describe('the agent connector', () => {
  it('cancels a run, without deleting it', async () => {
    const p = platform();
    await new AgentivityConnector({ baseUrl: 'http://platform.test', apiKey: 'key', fetchImpl: p.fetchImpl }).cancel({ runId: 'run-1' });

    expect(p.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/v1/runs/run-1/cancel']);
  });
});
