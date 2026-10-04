import { describe, expect, it, vi } from 'vitest';
import { AgentivityHttpCore } from '../src/client/http-core.js';
import { RunsApi } from '../src/client/api/runs-api.js';

const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('RunsApi.fetchExecutionStatuses', () => {
  it('reads the statuses of a run that failed — the inspector says "Failed" as data, it is not a failed request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        runId: 'r1',
        status: 'Failed',
        steps: [{ id: 'm1', name: 'Needs Analyst', kind: 'Agent', status: 'Failed', error: 'Your credit balance is too low', agentTopologyPositionId: 'needs', memberEntityId: null }],
      }),
    );
    const statuses = await new RunsApi(new AgentivityHttpCore({ baseUrl: 'https://api.example.com', fetchImpl })).fetchExecutionStatuses('e1');

    expect(statuses?.executionState).toBe('failed');
    expect(statuses?.members.get('m1')).toBe('failed');
  });

  it('still reports an unreachable status as undefined', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: 'boom' }, 500));
    const statuses = await new RunsApi(new AgentivityHttpCore({ baseUrl: 'https://api.example.com', fetchImpl })).fetchExecutionStatuses('e1');

    expect(statuses).toBeUndefined();
  });
});
