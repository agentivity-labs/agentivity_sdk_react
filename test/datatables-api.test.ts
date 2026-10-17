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

  // Reading a table a page at a time: the search (conditions, sort, page) is sent, and the page comes back with the total the
  // platform found — never a page taken for the whole table.
  function pageResponse(total: string | null): Response {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (total !== null) headers['X-Total-Count'] = total;
    return new Response(JSON.stringify([{ id: 101, createdAt: 'now', updatedAt: 'now', customer: 'Alice' }, { id: 102, createdAt: 'now', updatedAt: 'now', customer: 'Bob' }]), { status: 200, headers });
  }

  it('lists a page of rows, with the total found', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pageResponse('250'));
    const http = new AgentivityHttpCore({ baseUrl: 'https://api.example.com', fetchImpl });

    const page = await new DataTablesApi(http).listRowsPage('table-1', { where: [{ column: 'amount', op: '>', value: 10 }], orderBy: 'amount desc', limit: 2, offset: 100 });

    expect(page.rows.map((row) => row['customer'])).toEqual(['Alice', 'Bob']);
    expect(page.rows[0]!.id).toBe(101);
    expect(page.total).toBe(250);
    expect(page.offset).toBe(100);
    expect(page.hasMore).toBe(true);
    const url = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/api/v1/datatables/table-1/rows');
    expect(JSON.parse(url.searchParams.get('where')!)).toEqual([{ column: 'amount', op: '>', value: 10 }]);
    expect(url.searchParams.get('orderBy')).toBe('amount desc');
    expect(url.searchParams.get('limit')).toBe('2');
    expect(url.searchParams.get('offset')).toBe('100');
  });

  it('without a search, sends nothing but the page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pageResponse('250'));
    const http = new AgentivityHttpCore({ baseUrl: 'https://api.example.com', fetchImpl });

    await new DataTablesApi(http).listRowsPage('table-1', { limit: 100 });

    const url = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '100' });
  });

  it('a platform that does not say the total: the rows received are the total', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pageResponse(null));
    const http = new AgentivityHttpCore({ baseUrl: 'https://api.example.com', fetchImpl });

    const page = await new DataTablesApi(http).listRowsPage('table-1');

    expect(page.total).toBe(2);
    expect(page.hasMore).toBe(false);
  });

  it('rejects a blank table id before making a request', async () => {
    const fetchImpl = vi.fn();
    const http = new AgentivityHttpCore({ baseUrl: 'https://api.example.com', fetchImpl });
    await expect(new DataTablesApi(http).listRows('  ')).rejects.toThrow(/Data Table id/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
