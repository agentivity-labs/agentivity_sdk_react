import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatController } from '../src/chat/chat-controller.js';
import { TeamGraph } from '../src/chat/components/TeamGraph.js';
import { TeamRoster } from '../src/chat/components/TeamRoster.js';
import { teamMemberShortName, type AgUiTeamMember } from '../src/chat/components/team-member.js';

const members: AgUiTeamMember[] = [
  { memberEntityId: 'mgr', displayName: 'Trip Manager' },
  { memberEntityId: 'hotel', displayName: 'Hotel Specialist' },
  { memberEntityId: 'flight', displayName: 'Flight Specialist' },
];

const started = (id: string) => ({ type: 'STEP_STARTED', stepName: 's', memberEntityId: id, displayName: id }) as const;
const finished = (id: string) => ({ type: 'STEP_FINISHED', stepName: 's', memberEntityId: id, displayName: id }) as const;

describe('ChatController.memberStatuses', () => {
  it('is empty until a Team member takes a turn, then follows STEP_STARTED / STEP_FINISHED', () => {
    const controller = new ChatController();
    expect(controller.memberStatuses.size).toBe(0);

    controller.feedEvent(started('hotel'));
    expect(controller.memberStatuses.get('hotel')).toBe('working');

    controller.feedEvent(finished('hotel'));
    expect(controller.memberStatuses.get('hotel')).toBe('done');
    expect(controller.memberStatuses.has('flight')).toBe(false);
  });

  it('shows a member working again when it is called back after finishing', () => {
    const controller = new ChatController();
    controller.feedEvent(started('hotel'));
    controller.feedEvent(finished('hotel'));
    controller.feedEvent(started('hotel'));
    expect(controller.memberStatuses.get('hotel')).toBe('working');
  });

  it('never records a step that carries no member identity (a standalone Agent)', () => {
    const controller = new ChatController();
    controller.feedEvent({ type: 'STEP_STARTED', stepName: 's' });
    controller.feedEvent({ type: 'STEP_FINISHED', stepName: 's' });
    expect(controller.memberStatuses.size).toBe(0);
  });

  it('marks a member still mid-turn as waiting when the run pauses for a human answer', () => {
    const controller = new ChatController();
    controller.feedEvent(started('hotel'));
    controller.feedEvent({ type: 'RUN_FINISHED', runId: 'r1', outcome: { kind: 'interrupt', interrupts: [{ id: 'req', reason: 'chat_hil_gate', metadata: { threadId: 't1' } }] } });
    expect(controller.memberStatuses.get('hotel')).toBe('waiting');
  });

  it('settles a member still mid-turn as done when the run ends or fails', () => {
    const finishedRun = new ChatController();
    finishedRun.feedEvent(started('hotel'));
    finishedRun.feedEvent({ type: 'RUN_FINISHED', runId: 'r1' });
    expect(finishedRun.memberStatuses.get('hotel')).toBe('done');

    const failedRun = new ChatController();
    failedRun.feedEvent(started('hotel'));
    failedRun.feedEvent({ type: 'RUN_ERROR', message: 'boom' });
    expect(failedRun.memberStatuses.get('hotel')).toBe('done');
  });

  it('hands out a new Map on every change and resets on clear()', () => {
    const controller = new ChatController();
    const before = controller.memberStatuses;
    controller.feedEvent(started('hotel'));
    expect(controller.memberStatuses).not.toBe(before);
    expect(before.size).toBe(0);

    controller.clear();
    expect(controller.memberStatuses.size).toBe(0);
  });
});

describe('TeamRoster', () => {
  it('shows every member and reflects each one status as the run progresses', () => {
    const controller = new ChatController();
    render(<TeamRoster controller={controller} members={members} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Hotel Specialist, not needed yet')).toBeInTheDocument();

    act(() => controller.feedEvent(started('hotel')));
    expect(screen.getByText('Hotel Specialist, working now')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[1]).toHaveAttribute('data-status', 'working');

    act(() => controller.feedEvent(finished('hotel')));
    expect(screen.getByText('Hotel Specialist, done')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('data-status', 'idle');
  });
});

describe('TeamGraph', () => {
  it('draws the hub in the middle, links it to every other member and lights the one at work', () => {
    const controller = new ChatController();
    const { container } = render(<TeamGraph controller={controller} members={members} hubMemberId="mgr" />);

    expect(container.querySelectorAll('.ag-team-graph__node')).toHaveLength(3);
    expect(container.querySelectorAll('.ag-team-graph__edge')).toHaveLength(2);

    act(() => controller.feedEvent(started('flight')));
    const workingEdges = container.querySelectorAll('.ag-team-graph__edge[data-status="working"]');
    expect(workingEdges).toHaveLength(1);
    expect(container.querySelector('.ag-team-graph__node[data-status="working"] title')?.textContent).toBe('Flight Specialist — working now');
  });

  it('draws a plain ring with no links when no hub is given', () => {
    const controller = new ChatController();
    const { container } = render(<TeamGraph controller={controller} members={members} />);

    expect(container.querySelectorAll('.ag-team-graph__node')).toHaveLength(3);
    expect(container.querySelectorAll('.ag-team-graph__edge')).toHaveLength(0);
  });

  it('draws one branch per group — a junction, its name in capitals and a link to each member — and a hub link per group', () => {
    const controller = new ChatController();
    const grouped: AgUiTeamMember[] = [
      { memberEntityId: 'hub', displayName: 'Manager' },
      { memberEntityId: 'a', displayName: 'Alpha', group: 'Booking' },
      { memberEntityId: 'b', displayName: 'Beta', group: 'booking' },
      { memberEntityId: 'c', displayName: 'Gamma', group: 'Advice' },
      { memberEntityId: 'd', displayName: 'Delta' },
    ];
    const { container } = render(<TeamGraph controller={controller} members={grouped} hubMemberId="hub" />);

    expect(container.querySelectorAll('.ag-team-graph__junction')).toHaveLength(2);
    // Each group has a soft zone behind its members; a member without a group has none.
    expect(container.querySelectorAll('.ag-team-graph__zone')).toHaveLength(2);
    expect([...container.querySelectorAll('.ag-team-graph__group')].map((g) => g.textContent)).toEqual(['BOOKING', 'ADVICE']);
    // 4 members linked to their junction (or, ungrouped, to the hub) + one link from the hub to each of the 2 junctions.
    expect(container.querySelectorAll('.ag-team-graph__edge')).toHaveLength(6);
    // A branch wears its group's color.
    expect((container.querySelector('.ag-team-graph__branch') as SVGElement).style.color).not.toBe('');
  });

  it('lights the links of a member in the run, and only those', () => {
    const controller = new ChatController();
    const grouped: AgUiTeamMember[] = [
      { memberEntityId: 'hub', displayName: 'Manager' },
      { memberEntityId: 'a', displayName: 'Alpha', group: 'Booking' },
      { memberEntityId: 'b', displayName: 'Beta', group: 'Booking' },
    ];
    const { container } = render(<TeamGraph controller={controller} members={grouped} hubMemberId="hub" />);
    act(() => controller.feedEvent({ type: 'STEP_STARTED', stepName: 's', memberEntityId: 'a', displayName: 'Alpha' }));

    const status = [...container.querySelectorAll('.ag-team-graph__edge')].map((e) => e.getAttribute('data-status'));
    expect(status.filter((s) => s === 'working')).toHaveLength(2); // hub → junction and junction → Alpha
    expect(status.filter((s) => s === 'idle')).toHaveLength(1); // junction → Beta
  });

  it('zooms with the wheel, moves with a drag, and goes back to the fitted view with the fit button', () => {
    const controller = new ChatController();
    const { container } = render(<TeamGraph controller={controller} members={members} />);
    const svg = container.querySelector('svg.ag-team-graph') as SVGSVGElement;
    const viewport = () => container.querySelector('.ag-team-graph__viewport')!.getAttribute('transform')!;
    const fitted = viewport();
    expect(fitted).toContain('scale(1.0000)');

    fireEvent.wheel(svg, { deltaY: -200, clientX: 10, clientY: 10 });
    expect(viewport()).not.toBe(fitted);
    expect(Number(/scale\(([\d.]+)\)/.exec(viewport())![1])).toBeGreaterThan(1);

    const before = viewport();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 80, clientY: 70 });
    fireEvent.pointerUp(svg, { pointerId: 1 });
    expect(viewport()).not.toBe(before);

    fireEvent.click(screen.getByRole('button', { name: 'Fit to view' }));
    expect(viewport()).toBe(fitted);
  });

  it('shortens a long name to fit under its node but keeps the full name in the tooltip', () => {
    const controller = new ChatController();
    const long: AgUiTeamMember[] = [{ memberEntityId: 'r', displayName: 'Restaurant & Dining & Bar Specialist' }];
    const { container } = render(<TeamGraph controller={controller} members={long} />);

    expect(container.querySelector('.ag-team-graph__label')?.textContent).toBe('Restaurant & Di…');
    expect(container.querySelector('title')?.textContent).toContain('Restaurant & Dining & Bar Specialist');
  });
});

describe('teamMemberShortName', () => {
  it('drops the generic role word a name usually ends with', () => {
    expect(teamMemberShortName('Flight Specialist')).toBe('Flight');
    expect(teamMemberShortName('Payment Agent')).toBe('Payment');
    expect(teamMemberShortName('On-Trip Assistant')).toBe('On-Trip');
    expect(teamMemberShortName('Currency & Budget Advisor')).toBe('Currency & Budget');
  });

  it('keeps a name that is only the role word, or that does not end with one', () => {
    expect(teamMemberShortName('Specialist')).toBe('Specialist');
    expect(teamMemberShortName('Trip Manager')).toBe('Trip Manager');
    expect(teamMemberShortName('  Activity Planner ')).toBe('Activity Planner');
  });
});
