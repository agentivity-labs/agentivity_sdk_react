import { describe, expect, it, vi } from 'vitest';
import { AgentivityHttpCore } from '../src/client/http-core.js';
import { DataTablesApi } from '../src/client/api/datatables-api.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('DataTablesApi', () => {
  it('lists rows, forwarding an optional where filter as query params', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([{ id: 1, createdAt: '2026-06-12T00:00:00Z', updatedAt: '2026-06-12T00:00:00Z', destination: 'Lisbonne' }]),
    );
    const http = new AgentivityHttpCore({ baseUrl: 'https://api.example.com', fetchImpl });
    const rows = await new DataTablesApi(http).listRows('trips', { whereColumn: 'userId', whereValue: 'u1' });

    expect(rows).toEqual([{ id: 1, createdAt: '2026-06-12T00:00:00Z', updatedAt: '2026-06-12T00:00:00Z', destination: 'Lisbonne' }]);
    const url = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/api/v1/datatables/trips/rows');
    expect(url.searchParams.get('whereColumn')).toBe('userId');
    expect(url.searchParams.get('whereValue')).toBe('u1');
  });

  it('inserts a row and parses the assigned id back', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: 7, createdAt: 'now', updatedAt: 'now', destination: 'Porto' }));
    const http = new AgentivityHttpCore({ baseUrl: 'https://api.example.com', fetchImpl });
    const row = await new DataTablesApi(http).insertRow('trips', { destination: 'Porto' });

    expect(row.id).toBe(7);
    expect(row['destination']).toBe('Porto');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(new URL(url as string).pathname).toBe('/api/v1/datatables/trips/rows');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('rejects a blank table id before making a request', async () => {
    const fetchImpl = vi.fn();
    const http = new AgentivityHttpCore({ baseUrl: 'https://api.example.com', fetchImpl });
    await expect(new DataTablesApi(http).listRows('  ')).rejects.toThrow(/Data Table id/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
