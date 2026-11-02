import { parseAgUiEvent } from '../src/protocol/events.js';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatController } from '../src/chat/chat-controller.js';
import { ChatDiscussion, type ChatDiscussionProps } from '../src/chat/components/ChatDiscussion.js';
import type { AgUiTeamMember } from '../src/chat/components/team-member.js';
import { buildTeamProgress, summarizeForCustomer, type TeamProgressInput } from '../src/chat/team-progress.js';
import { AgentivityClient } from '../src/client/agentivity-client.js';
import { ApiException } from '../src/client/api-contract.js';
import type { ExecutionMemberStep } from '../src/client/domain/execution-status-models.js';
import { AgentivityProvider } from '../src/react/AgentivityProvider.js';

const topology = { kind: 'manager-led', links: [] } as const;
const members: AgUiTeamMember[] = [
  { memberEntityId: 'lead', displayName: 'Lead', topology },
  { memberEntityId: 'a', displayName: 'Analyst', topology },
  { memberEntityId: 'b', displayName: 'Writer', topology },
];

function input(over: Partial<TeamProgressInput> = {}): TeamProgressInput {
  return { executionId: 'e1', members, streamStatuses: new Map(), seenMembers: new Map(), steps: new Map(), executionState: 'running', questionPending: false, awaitingResponse: true, failed: false, ...over };
}
const step = (id: string, state: ExecutionMemberStep['state'], result?: string): [string, ExecutionMemberStep] => [id, { memberEntityId: id, state, result }];

describe('ChatController.memberActivities', () => {
  it('keeps what a member does for its turn only', () => {
    const controller = new ChatController({ contextId: 'x' });
    controller.feedEvent({ type: 'STEP_STARTED', executionId: 'e1', stepName: 's', memberEntityId: 'a', activity: 'Picking your exercises' });
    expect(controller.memberActivities.get('a')).toBe('Picking your exercises');
    controller.feedEvent({ type: 'STEP_STARTED', executionId: 'e1', stepName: 's', memberEntityId: 'a' });
    expect(controller.memberActivities.has('a')).toBe(false);
  });

  it('reads it from the stream', () => {
    expect(parseAgUiEvent({ type: 'STEP_STARTED', stepName: 's', activity: 'Picking your exercises' })).toMatchObject({ activity: 'Picking your exercises' });
  });
});

describe('summarizeForCustomer', () => {
  it('takes the title of a result, without its Markdown', () => {
    expect(summarizeForCustomer('# Tom\'s plan, safety-checked and corrected\n\nTom reported no injuries.')).toBe("Tom's plan, safety-checked and corrected");
    expect(summarizeForCustomer('**Training plan for Tom: 2 days a week.** All picks come from the catalogue.')).toBe('Training plan for Tom: 2 days a week');
  });

  it('skips a heading of a word or two', () => {
    expect(summarizeForCustomer('**Rules**\n- **Protein at every meal.** Aim for 120 g a day.')).toBe('Protein at every meal');
  });

  it('cuts at a word, within a few words', () => {
    const summary = summarizeForCustomer('word '.repeat(40))!;
    expect(summary.length).toBeLessThanOrEqual(91);
    expect(summary.endsWith('word…')).toBe(true);
  });

  it('gives nothing rather than what a team writes for itself', () => {
    for (const text of ['@team Writer, please pick the exercises from the catalogue', 'I called `search_catalog` with these args', 'Calling the search_catalog tool on the data', '{"plan": "the whole plan"}', 'See https://example.com/internal for more', undefined]) {
      expect(summarizeForCustomer(text)).toBeUndefined();
    }
  });
});

describe('buildTeamProgress', () => {
  it('stays out of the way of a manager answering alone', () => {
    expect(buildTeamProgress(input({ streamStatuses: new Map([['lead', 'working']]) })).visible).toBe(false);
  });

  it('needs no team definition: the progress lists every member and says who the manager is', () => {
    const steps = new Map<string, ExecutionMemberStep>([
      ['lead', { memberEntityId: 'lead', displayName: 'Lead', state: 'working', isManager: true }],
      ['a', { memberEntityId: 'a', displayName: 'Analyst', state: 'done', result: 'The market grew by a third.' }],
      ['b', { memberEntityId: 'b', displayName: 'Writer' }],
    ]);
    const progress = buildTeamProgress(input({ members: undefined, steps }));
    expect(progress.agents.map((a) => [a.displayName, a.status, a.isManager])).toEqual([['Lead', 'working', true], ['Analyst', 'done', false], ['Writer', 'pending', false]]);
    expect(progress.visible).toBe(true);
    expect(progress.total).toBe(2);
  });

  it('says what an agent does as soon as the stream says it, ahead of the progress', () => {
    const progress = buildTeamProgress(input({ streamStatuses: new Map([['a', 'working']]), streamActivities: new Map([['a', 'Picking your exercises']]), steps: new Map([['a', { memberEntityId: 'a', state: 'working', activity: 'Old words' }]]) }));
    expect(progress.agents.find((a) => a.memberEntityId === 'a')?.description).toBe('Picking your exercises');
  });

  it('gives every member one line, the stream ahead of the inspector', () => {
    const progress = buildTeamProgress(input({ streamStatuses: new Map([['lead', 'done'], ['a', 'working']]), steps: new Map([step('a', 'done', 'old result')]) }));
    expect(progress.visible).toBe(true);
    expect(progress.agents.map((a) => [a.memberEntityId, a.status])).toEqual([['lead', 'pending'], ['a', 'working'], ['b', 'pending']]);
    expect(progress.agents[1]!.result).toBeUndefined();
    expect([progress.done, progress.total]).toEqual([0, 2]);
  });

  it('never opens what the manager wrote: it is a brief for the team, or the answer itself', () => {
    const progress = buildTeamProgress(input({ executionState: 'completed', steps: new Map([step('lead', 'done', '@team Writer, go'), step('a', 'done', 'The market grew by a third.')]) }));
    expect(progress.agents.find((a) => a.isManager)).toMatchObject({ result: undefined, description: undefined });
  });

  it('keeps those who took part once it ends, with how long it took', () => {
    const progress = buildTeamProgress(input({ executionState: 'completed', startedAt: '2026-01-01T10:00:00Z', lastStepAt: '2026-01-01T10:04:32Z', steps: new Map([step('lead', 'done'), step('a', 'done', 'The market grew by a third.')]) }));
    expect(progress.agents.map((a) => a.memberEntityId)).toEqual(['lead', 'a']);
    expect(progress).toMatchObject({ phase: 'done', worked: 2, durationMs: 272000 });
    expect(progress.agents[1]).toMatchObject({ description: 'The market grew by a third', result: 'The market grew by a third.' });
  });

  it('prefers the words of the platform', () => {
    const working = buildTeamProgress(input({ steps: new Map([['a', { memberEntityId: 'a', state: 'working', activity: 'Comparing three suppliers' }]]) }));
    expect(working.agents[1]!.description).toBe('Comparing three suppliers');
    const done = buildTeamProgress(input({ executionState: 'completed', steps: new Map([['a', { memberEntityId: 'a', state: 'done', summary: 'Found the best supplier', result: 'A long report on the suppliers.' }]]) }));
    expect(done.agents.find((a) => a.memberEntityId === 'a')!.description).toBe('Found the best supplier');
  });

  it('goes by the stream alone when nothing else can be read', () => {
    const progress = buildTeamProgress(input({ members: undefined, executionState: '', seenMembers: new Map([['lead', 'Lead'], ['a', 'Analyst']]), streamStatuses: new Map([['lead', 'done'], ['a', 'working']]) }));
    expect(progress).toMatchObject({ phase: 'working', visible: true });
    expect(progress.agents.map((a) => a.displayName)).toEqual(['Lead', 'Analyst']);
  });

  it.each([
    [{ questionPending: true }, 'waiting'],
    [{ executionState: 'failed' }, 'failed'],
    [{ executionState: 'cancelled' }, 'stopped'],
    [{ executionState: '', awaitingResponse: false, failed: true }, 'failed'],
    [{ executionState: '', awaitingResponse: false }, 'done'],
  ])('reads where it stands from %o', (over, phase) => {
    expect(buildTeamProgress(input(over)).phase).toBe(phase);
  });
});

describe('ChatController, from one execution to the next', () => {
  it('knows the execution and who took a turn, and starts afresh with another one', () => {
    const c = new ChatController();
    c.feedEvent({ type: 'RUN_STARTED', runId: 'r1', executionId: 'e1' } as never);
    c.feedEvent({ type: 'STEP_STARTED', stepName: 's', memberEntityId: 'a', displayName: 'Analyst', executionId: 'e1' });
    expect(c.executionId).toBe('e1');
    expect(c.seenMembers.get('a')).toBe('Analyst');

    c.feedEvent({ type: 'STEP_STARTED', stepName: 's', memberEntityId: 'b', displayName: 'Writer', executionId: 'e2' });
    expect(c.executionId).toBe('e2');
    expect([...c.seenMembers.keys()]).toEqual(['b']);
    expect(c.memberStatuses.has('a')).toBe(false);
  });
});

const inspector = (status: string, steps: Record<string, unknown>[]) => ({ status, steps, callSequence: [{ occurredAt: '2026-01-01T10:04:32Z' }] });

function clientWith(read: { statuses: () => unknown; team?: () => unknown }) {
  const client = new AgentivityClient({ baseUrl: 'https://example.test' } as never);
  vi.spyOn(client.runs, 'fetchExecutionStatuses').mockImplementation(read.statuses as never);
  vi.spyOn(client.runs, 'fetchExecution').mockResolvedValue({ executionId: 'e1', entityId: 't1', entityKind: 'team', state: '', channels: {}, createdAt: '2026-01-01T10:00:00Z' });
  vi.spyOn(client.entities, 'fetchTeam').mockImplementation((read.team ?? (async () => ({ id: 't1', name: 'T', orchestratorId: 'manager-led', members: [{ memberEntityId: 'lead', displayName: 'Lead', topologyPositionId: 'l', memberType: 'agent' }, { memberEntityId: 'a', displayName: 'Analyst', topologyPositionId: 'x', memberType: 'agent' }, { memberEntityId: 'b', displayName: 'Writer', topologyPositionId: 'y', memberType: 'agent' }], connections: [], groupColors: {} }))) as never);
  return client;
}

function chat(controller: ChatController, client: AgentivityClient, props: Partial<ChatDiscussionProps> = {}) {
  return render(
    <AgentivityProvider client={client}>
      <ChatDiscussion controller={controller} onSend={() => {}} showActiveMemberIndicator {...props} />
    </AgentivityProvider>,
  );
}

function teamAtWork() {
  const c = new ChatController();
  c.feedEvent({ type: 'CUSTOM', name: 'CHAT_THREAD_CREATED', value: { threadId: 't', isDefault: true } });
  c.feedEvent({ type: 'CUSTOM', name: 'CHAT_MESSAGE_RECEIVED', value: { threadId: 't', messageId: 'u1', role: 'user', text: 'Write my report' } });
  c.feedEvent({ type: 'RUN_STARTED', runId: 'r', executionId: 'e1' } as never);
  c.feedEvent({ type: 'STEP_STARTED', stepName: 's', memberEntityId: 'lead', displayName: 'Lead', executionId: 'e1' });
  c.feedEvent({ type: 'STEP_FINISHED', stepName: 's', memberEntityId: 'lead', executionId: 'e1' });
  c.feedEvent({ type: 'STEP_STARTED', stepName: 's', memberEntityId: 'a', displayName: 'Analyst', executionId: 'e1' });
  return c;
}

const working = () => Promise.resolve({ executionState: 'running', ...parsed([{ id: 'a', status: 'Running' }]) });
function parsed(steps: { id: string; status: string; output?: string }[]) {
  const state = (s: string) => (s === 'Running' ? 'working' : 'done');
  return {
    nodes: new Map(),
    members: new Map(steps.map((s) => [s.id, state(s.status)])),
    memberSteps: new Map(steps.map((s) => [s.id, { memberEntityId: s.id, state: state(s.status), result: s.output }])),
    lastStepAt: '2026-01-01T10:04:32Z',
  };
}

describe('ChatTeamProgress in a chat', () => {
  it('shows one line per agent with no code in the app, in place of the indicator', async () => {
    chat(teamAtWork(), clientWith({ statuses: working }));
    const list = await screen.findByRole('list');
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
    expect(within(list).getByText('Writer')).toBeInTheDocument();
    expect(within(list).getByText('Waiting for its turn')).toBeInTheDocument();
    expect(within(list).getByText('Working on it…')).toBeInTheDocument();
    expect(within(list).getByText('Organizing the work')).toBeInTheDocument();
    expect(screen.getByText('0 of 2 done')).toBeInTheDocument();
    expect(screen.queryByText('is working on it', { exact: false })).toBeNull();
  });

  it('collapses to one line above the answer when it ends, and opens an agent to read its result', async () => {
    const user = userEvent.setup();
    const c = teamAtWork();
    const result = 'The market grew by a third.\n\nMore details follow.';
    const client = clientWith({ statuses: () => Promise.resolve({ executionState: 'completed', ...parsed([{ id: 'lead', status: 'Completed' }, { id: 'a', status: 'Completed', output: result }]) }) });
    chat(c, client);
    act(() => {
      c.feedEvent({ type: 'CUSTOM', name: 'CHAT_MESSAGE_RECEIVED', value: { threadId: 't', messageId: 'm2', role: 'assistant', text: 'Your report is ready' } });
      c.feedEvent({ type: 'RUN_FINISHED', runId: 'r', executionId: 'e1' } as never);
    });

    const head = await screen.findByRole('button', { name: '2 agents worked for 4 min 32 s' });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).toBeNull();
    // Between the request and the answer.
    expect(screen.getByText('Write my report').compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(head.compareDocumentPosition(screen.getByText('Your report is ready')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(head);
    await user.click(screen.getByRole('button', { name: 'Read the result of Analyst' }));
    expect(screen.getByText('More details follow.')).toBeInTheDocument();
    expect(screen.getByText('Brought it all together')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /of Lead/ })).toBeNull();
  });

  it('falls back on the names and statuses of the stream when the key may read nothing', async () => {
    const client = clientWith({ statuses: () => Promise.resolve(null), team: () => Promise.reject(new ApiException({ httpStatus: 403 } as never)) });
    chat(teamAtWork(), client);
    expect(await screen.findByText('Analyst')).toBeInTheDocument();
    expect(screen.getByText('Lead')).toBeInTheDocument();
    expect(screen.queryByText('Writer')).toBeNull();
    expect(client.runs.fetchExecutionStatuses).toHaveBeenCalledTimes(1);
  });

  it('can be turned off', async () => {
    const client = clientWith({ statuses: working });
    chat(teamAtWork(), client, { showTeamProgress: false });
    await act(async () => {});
    expect(screen.queryByRole('region', { name: 'Team progress' })).toBeNull();
    expect(client.runs.fetchExecutionStatuses).not.toHaveBeenCalled();
    expect(screen.getByText('is working on it', { exact: false })).toBeInTheDocument();
  });

  it('shows nothing for a standalone agent', async () => {
    const c = new ChatController();
    c.feedEvent({ type: 'RUN_STARTED', runId: 'r', executionId: 'e1' } as never);
    const client = clientWith({ statuses: () => Promise.resolve({ executionState: 'running', ...parsed([]) }) });
    vi.spyOn(client.runs, 'fetchExecution').mockResolvedValue({ executionId: 'e1', entityId: 'x', entityKind: 'agent', state: '', channels: {} });
    chat(c, client);
    await act(async () => {});
    expect(screen.queryByRole('region', { name: 'Team progress' })).toBeNull();
  });
});

describe('RunsApi.fetchExecutionStatuses of a team', () => {
  it('reads each member with its result and when the last turn ended', async () => {
    const { parseExecutionStatuses } = await import('../src/client/domain/execution-status-models.js');
    const waiting = parseExecutionStatuses(inspector('Running', [{ id: 'lead', name: 'Lead', status: 'Running', agentTopologyPositionId: 'l', isManager: true }, { id: 'b', name: 'Writer', status: 'Pending', agentTopologyPositionId: 'b' }]));
    expect(waiting.members.has('b')).toBe(false);
    expect(waiting.memberSteps.get('b')).toMatchObject({ displayName: 'Writer', state: undefined });
    expect(waiting.memberSteps.get('lead')?.isManager).toBe(true);

    const statuses = parseExecutionStatuses(inspector('Completed', [{ id: 'a', name: 'Analyst', status: 'Completed', agentTopologyPositionId: 'x', outputs: { output: 'Result' } }]));
    expect(statuses.memberSteps.get('a')).toMatchObject({ displayName: 'Analyst', state: 'done', result: 'Result' });
    expect(statuses.lastStepAt).toBe('2026-01-01T10:04:32Z');
  });
});
