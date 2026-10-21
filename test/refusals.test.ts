import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiException } from '../src/client/api-contract.js';
import { AgUiSseChannel, type AgUiConnectionState } from '../src/protocol/sse-channel.js';

const json = (body: unknown, status: number): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('a refusal of the instance', () => {
  it('says its code and its words, from the answers of the identity of the instance', () => {
    const refused = ApiException.fromResponse({ error: 'permission_denied', permission: 'runs.start', message: 'Your role does not allow this.' }, 403);

    expect(refused.code).toBe('permission_denied');
    expect(refused.message).toBe('Your role does not allow this.');
    expect(refused.permission).toBe('runs.start');
    expect(refused.kind).toBe('forbidden');
    expect(refused.isFinal).toBe(true);
  });

  it('says its code and its words, from the answers of the rest of the API', () => {
    const refused = ApiException.fromResponse({ code: 'credentials_not_found', userMessage: 'These credentials could not be found.', httpStatus: 404 }, 404);

    expect(refused.code).toBe('credentials_not_found');
    expect(refused.message).toBe('These credentials could not be found.');
    expect(refused.kind).toBe('not_found');
  });

  it('is said in words when the instance gives only its code', () => {
    expect(ApiException.fromResponse({ error: 'sign_in_required' }, 401).message).toContain('give the SDK an API key (agv_');
    expect(ApiException.fromResponse({ error: 'origin_not_allowed' }, 403).message).toContain('add it to the sites of the key');
    expect(ApiException.fromResponse({ error: 'sign_in_required' }, 401).kind).toBe('key');
  });

  it('is final, but too many calls, a timeout and the server are tried again', () => {
    expect(ApiException.fromResponse({ error: 'invalid_key' }, 401).isFinal).toBe(true);
    expect(ApiException.fromResponse({ error: 'too_many_starts' }, 429).isFinal).toBe(false);
    expect(ApiException.fromResponse(undefined, 408).isFinal).toBe(false);
    expect(ApiException.fromResponse(undefined, 503).isFinal).toBe(false);
    expect(ApiException.fromNetworkError(new Error('Failed to fetch')).isFinal).toBe(false);
  });
});

describe('a stream the instance refuses', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stops and says why, instead of reconnecting for ever', async () => {
    const opener = vi.fn(async () => json({ error: 'invalid_key', message: 'The key is not valid.' }, 401));
    const channel = new AgUiSseChannel({ opener, path: '/api/v1/streams/s1', parser: () => undefined });
    const states: AgUiConnectionState[] = [];
    channel.subscribeConnectionState((state) => states.push(state));

    channel.start();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(opener).toHaveBeenCalledTimes(1);
    const last = states.at(-1)!;
    expect(last.status).toBe('terminated');
    expect(last.refusal?.code).toBe('invalid_key');
    expect(last.refusal?.message).toBe('The key is not valid.');
    channel.dispose();
  });

  it('is tried again when the server is not there', async () => {
    const opener = vi.fn(async () => json({}, 503));
    const channel = new AgUiSseChannel({ opener, path: '/api/v1/streams/s1', parser: () => undefined });

    channel.start();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(opener.mock.calls.length).toBeGreaterThan(1);
    expect(channel.connectionStateSnapshot.refusal).toBeUndefined();
    channel.dispose();
  });
});
