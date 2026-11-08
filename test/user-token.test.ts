import { describe, expect, it, vi } from 'vitest';
import { AgentivityPlatformClient } from '../src/client/platform-client.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const authorizationOf = (fetchImpl: ReturnType<typeof vi.fn>, call: number) => new Headers((fetchImpl.mock.calls[call]![1] as RequestInit | undefined)?.headers).get('Authorization');
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

/** A page speaks for a user of an API key: each has their own conversations, with a token worth a few minutes. */
describe('a client speaking for a user of an API key', () => {
  it('sends their token rather than the key, the streams included', async () => {
    const fetchImpl = vi.fn(async () => json([]));
    const client = new AgentivityPlatformClient({ baseUrl: 'https://instance.example.com', fetchImpl, apiKey: 'agv_server' });
    client.setUserToken({ token: 'agu_alice', expiresAt: inMinutes(15) });

    await client.httpCore.get('/api/v1/executions');
    await client.httpCore.openStream('/api/v1/streams/s1');

    expect(authorizationOf(fetchImpl, 0)).toBe('Bearer agu_alice');
    expect(authorizationOf(fetchImpl, 1)).toBe('Bearer agu_alice');
  });

  it('asks for a token at the first request, and for the next one before the end of the last', async () => {
    const fetchImpl = vi.fn(async () => json([]));
    const renew = vi.fn().mockResolvedValueOnce({ token: 'agu_first', expiresAt: inMinutes(0.5) }).mockResolvedValueOnce({ token: 'agu_second', expiresAt: inMinutes(15) });
    const client = new AgentivityPlatformClient({ baseUrl: 'https://instance.example.com', fetchImpl });
    client.setUserToken(null, renew);

    await client.httpCore.get('/api/v1/executions');
    await client.httpCore.get('/api/v1/executions');
    await client.httpCore.get('/api/v1/executions');

    expect(renew).toHaveBeenCalledTimes(2);
    expect(authorizationOf(fetchImpl, 0)).toBe('Bearer agu_first');
    expect(authorizationOf(fetchImpl, 1)).toBe('Bearer agu_second');
    expect(authorizationOf(fetchImpl, 2)).toBe('Bearer agu_second');
  });

  it('asks for a new one when the instance refuses it, and sends the request once more', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ error: 'invalid_user_token', message: 'No longer worth anything.' }, 401)).mockResolvedValueOnce(json([]));
    const renew = vi.fn().mockResolvedValue({ token: 'agu_next' });
    const client = new AgentivityPlatformClient({ baseUrl: 'https://instance.example.com', fetchImpl });
    client.setUserToken('agu_old', renew);

    await client.httpCore.get('/api/v1/executions');

    expect(renew).toHaveBeenCalledTimes(1);
    expect(authorizationOf(fetchImpl, 0)).toBe('Bearer agu_old');
    expect(authorizationOf(fetchImpl, 1)).toBe('Bearer agu_next');
  });

  it('a person signed in through the key: renewed with the token they have, then signed out', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/sign-in')) return json({ token: 'agu_alice', expiresAt: inMinutes(0.5), user: { id: 'u1', name: 'Alice', email: 'alice@example.test' } });
      if (url.endsWith('/user-tokens/renew')) return json({ token: 'agu_alice_2', expiresAt: inMinutes(15) });
      return url.endsWith('/sign-out') ? new Response(null, { status: 204 }) : json([]);
    });
    const client = new AgentivityPlatformClient({ baseUrl: 'https://instance.example.com', fetchImpl });

    const signedIn = await client.keys.signIn({ keyId: 'hr', email: 'alice@example.test', password: 'secret' });
    await client.httpCore.get('/api/v1/executions');
    await client.keys.signOut('hr');
    await client.httpCore.get('/api/v1/executions');

    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(signedIn.user.name).toBe('Alice');
    expect(urls[1]).toContain('/api/v1/keys/hr/user-tokens/renew');
    expect(authorizationOf(fetchImpl, 1)).toBe('Bearer agu_alice');
    expect(authorizationOf(fetchImpl, 2)).toBe('Bearer agu_alice_2');
    expect(urls[3]).toContain('/api/v1/keys/hr/sign-out');
    expect(authorizationOf(fetchImpl, 3)).toBe('Bearer agu_alice_2');
    expect(authorizationOf(fetchImpl, 4)).toBeNull();
  });
});

/** On a server, with the key: tokens for the users of the system, and visitors of a demo. */
describe('a server with its API key', () => {
  it('asks for the token of a user, and for a visitor, with the key', async () => {
    const fetchImpl = vi.fn(async () => json({ token: 'agu_user', expiresAt: inMinutes(15) }));
    const client = new AgentivityPlatformClient({ baseUrl: 'https://instance.example.com', fetchImpl, apiKey: 'agv_k1_secret' });

    await client.keys.userToken({ userId: 'u1', name: 'Alice' });
    await client.keys.visitor();

    expect(String(fetchImpl.mock.calls[0]![0])).toContain('/api/v1/keys/user-tokens');
    expect(String(fetchImpl.mock.calls[1]![0])).toContain('/api/v1/keys/visitors');
    expect(authorizationOf(fetchImpl, 0)).toBe('Bearer agv_k1_secret');
    expect(authorizationOf(fetchImpl, 1)).toBe('Bearer agv_k1_secret');
  });
});

/** A page of a demo: an anonymous visitor of its own, asked of the demo's server, kept by the browser between visits. */
describe('a visitor of a demo', () => {
  const memory = () => {
    const kept = new Map<string, string>();
    return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
  };

  it('is asked once, then kept for the next visit', async () => {
    let given = 0;
    const fetchImpl = vi.fn(async () => json([]));
    const fromServer = async () => ({ token: `agu_visitor_${++given}`, expiresAt: inMinutes(60 * 24 * 7) });
    const storage = memory();

    const first = new AgentivityPlatformClient({ baseUrl: 'https://instance.example.com', fetchImpl });
    first.keys.visitDemo(fromServer, storage);
    await first.httpCore.get('/api/v1/executions');
    const again = new AgentivityPlatformClient({ baseUrl: 'https://instance.example.com', fetchImpl });
    again.keys.visitDemo(fromServer, storage);
    await again.httpCore.get('/api/v1/executions');

    expect(given).toBe(1);
    expect(authorizationOf(fetchImpl, 0)).toBe('Bearer agu_visitor_1');
    expect(authorizationOf(fetchImpl, 1)).toBe('Bearer agu_visitor_1');
  });

  it('gets a new visitor when the one kept is refused', async () => {
    let given = 0;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer agu_gone' ? json({ error: 'invalid_user_token' }, 401) : json([]));
    const fromServer = async () => ({ token: `agu_visitor_${++given}`, expiresAt: inMinutes(60) });
    const storage = memory();
    storage.setItem('agentivity.visitor', JSON.stringify({ token: 'agu_gone', expiresAt: inMinutes(60) }));
    const client = new AgentivityPlatformClient({ baseUrl: 'https://instance.example.com', fetchImpl });
    client.keys.visitDemo(fromServer, storage);

    await client.httpCore.get('/api/v1/executions');

    expect(given).toBe(1);
    expect(JSON.parse(storage.getItem('agentivity.visitor')!).token).toBe('agu_visitor_1');
  });
});
