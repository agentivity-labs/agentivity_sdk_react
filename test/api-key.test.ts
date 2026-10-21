import { describe, expect, it, vi } from 'vitest';
import { AgentivityPlatformClient } from '../src/client/platform-client.js';

const answering = () => vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
const authorizationOf = (fetchImpl: ReturnType<typeof answering>, call = 0) => new Headers(fetchImpl.mock.calls[call]![1]?.headers).get('Authorization');

/** On an instance that asks to sign in, a program gives the key a person made for it: the client sends it with every request. */
describe('a client given a key', () => {
  it('sends it with every request, the streams included', async () => {
    const fetchImpl = answering();
    const client = new AgentivityPlatformClient({ baseUrl: 'https://instance.example.com', fetchImpl, apiKey: ' agv_0a1b2c3d4e5f_secret ' });

    await client.httpCore.get('/api/v1/entities');
    await client.httpCore.openStream('/api/v1/streams/s1');

    expect(authorizationOf(fetchImpl, 0)).toBe('Bearer agv_0a1b2c3d4e5f_secret');
    expect(authorizationOf(fetchImpl, 1)).toBe('Bearer agv_0a1b2c3d4e5f_secret');
  });

  it('sends none without a key', async () => {
    const fetchImpl = answering();
    const client = new AgentivityPlatformClient({ baseUrl: 'http://localhost:5005', fetchImpl });

    await client.httpCore.get('/api/v1/entities');

    expect(authorizationOf(fetchImpl)).toBeNull();
  });
});
