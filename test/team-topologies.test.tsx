import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatController } from '../src/chat/chat-controller.js';
import { TeamGraph } from '../src/chat/components/TeamGraph.js';
import { concurrentScene, groupChatScene, handoffScene, sceneFor, sequentialScene, type SceneFrame } from '../src/chat/components/team-layouts.js';
import { teamMembersFromStructure, teamTopology, type AgUiTeamMember } from '../src/chat/components/team-member.js';
import type { TeamStructure } from '../src/client/domain/team-definition-models.js';

const FRAME: SceneFrame = { width: 400, height: 380, center: { x: 200, y: 190 }, ring: { x: 152, y: 132 } };
const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`);

const structure = (orchestratorId: string, n: number, connections: [number, number][] = [], manager?: number): TeamStructure => ({
  id: 't',
  name: 'Team',
  orchestratorId,
  managerTopologyPositionId: manager === undefined ? undefined : `p${manager}`,
  members: ids(n).map((id, i) => ({ topologyPositionId: `p${i + 1}`, memberEntityId: id, memberType: 'agent', displayName: `Member ${i + 1}`, group: i < 2 ? 'Intake' : undefined })),
  connections: connections.map(([from, to]) => ({ fromTopologyPositionId: `p${from}`, toTopologyPositionId: `p${to}`, types: ['message'] })),
  groupColors: {},
});

describe('teamTopology — what a saved team looks like', () => {
  it('names each orchestrator the backend has', () => {
    for (const [orchestrator, kind] of [['sequential', 'sequential'], ['concurrent', 'concurrent'], ['handoff', 'handoff'], ['group-chat', 'group-chat'], ['manager-led', 'manager-led'], ['Group_Chat', 'group-chat']] as const) {
      expect(teamTopology(structure(orchestrator, 3))?.kind).toBe(kind);
    }
  });

  it('has no opinion about an orchestrator it does not know', () => {
    expect(teamTopology(structure('some-future-orchestrator', 3))).toBeUndefined();
  });

  it('turns the links between positions into links between members, dropping loops and repeats', () => {
    const team = structure('handoff', 3, [[1, 2], [2, 3], [2, 3], [3, 3]]);
    expect(teamTopology(team)?.links).toEqual([{ from: 'm1', to: 'm2' }, { from: 'm2', to: 'm3' }]);
  });

  it('is put on every member, so a graph given only the members can draw the right layout', () => {
    const members = teamMembersFromStructure(structure('sequential', 3));
    expect(members.every((m) => m.topology?.kind === 'sequential')).toBe(true);
  });
});

describe('layouts', () => {
  it('sequential: one link between neighbours, snaking so each row starts under the end of the previous one', () => {
    const scene = sequentialScene(ids(9), [], FRAME);
    expect(scene.members.map((m) => m.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(scene.edges).toHaveLength(8);
    const [m1, m2, m3, m4] = scene.members;
    expect(m2!.at.x).toBeGreaterThan(m1!.at.x); // left to right on the first row
    expect(m4!.at.y).toBeGreaterThan(m3!.at.y); // the next row…
    expect(Math.abs(m4!.at.x - m3!.at.x)).toBeLessThan(1); // …starts right under where the first ended
    expect(new Set(scene.members.map((m) => `${m.at.x.toFixed(0)},${m.at.y.toFixed(0)}`)).size).toBe(9); // nobody on top of anybody
  });

  it('sequential: follows the links the team defines when there are some', () => {
    const scene = sequentialScene(ids(3), [{ from: 'm1', to: 'm3' }], FRAME);
    expect(scene.edges).toHaveLength(1);
    expect(scene.edges[0]!.lit).toBe('m3');
  });

  it('sequential: a short chain stays on one row', () => {
    const scene = sequentialScene(ids(3), [], FRAME);
    expect(new Set(scene.members.map((m) => m.at.y.toFixed(0))).size).toBe(1);
  });

  it('concurrent: a lane in and out for each of a few members', () => {
    const scene = concurrentScene(ids(4), FRAME);
    expect(scene.edges).toHaveLength(8);
    expect(scene.dots.map((d) => d.key)).toEqual(['start', 'join']);
    expect(scene.band).toBeUndefined();
  });

  it('concurrent: many members sit in one band between the start and the join, which light with the team as a whole', () => {
    const scene = concurrentScene(ids(9), FRAME);
    expect(scene.band).toBeDefined();
    expect(scene.edges.map((e) => e.lit)).toEqual(['any', 'all']);
    for (const m of scene.members) {
      expect(m.at.x).toBeGreaterThan(scene.band!.x);
      expect(m.at.x).toBeLessThan(scene.band!.x + scene.band!.width);
      expect(m.at.y).toBeGreaterThan(scene.band!.y);
      expect(m.at.y).toBeLessThan(scene.band!.y + scene.band!.height);
    }
  });

  it('handoff: the links of the definition, plus a way in for the first member', () => {
    const scene = handoffScene(ids(4), [{ from: 'm1', to: 'm2' }, { from: 'm2', to: 'm1' }, { from: 'm2', to: 'm4' }], FRAME);
    expect(scene.edges.map((e) => e.key)).toEqual(['link-0', 'link-1', 'link-2', 'entry']);
    expect(scene.edges.find((e) => e.key === 'entry')!.lit).toBe('m1');
    expect(scene.members[0]!.labelAbove).toBeFalsy(); // the entry is reached from above: its name stays below
  });

  it('handoff: ignores a link to a member that is not in the team', () => {
    expect(handoffScene(ids(2), [{ from: 'm1', to: 'ghost' }], FRAME).edges.map((e) => e.key)).toEqual(['entry']);
  });

  it('group chat: every member is linked to the conversation at the center', () => {
    const scene = groupChatScene(ids(5), FRAME);
    expect(scene.edges).toHaveLength(5);
    expect(scene.edges.every((e) => !e.arrow)).toBe(true);
    expect(scene.dots).toEqual([{ key: 'center', at: FRAME.center }]);
  });

  it('manager-led has no layout of its own here: the graph draws it as its constellation', () => {
    expect(sceneFor('manager-led', ids(3), [], FRAME)).toBeUndefined();
  });

  it('copes with an empty team and a single member', () => {
    for (const kind of ['sequential', 'concurrent', 'handoff', 'group-chat'] as const) {
      expect(sceneFor(kind, [], [], FRAME)!.members).toEqual([]);
      expect(sceneFor(kind, ['solo'], [], FRAME)!.members).toHaveLength(1);
    }
  });
});

describe('TeamGraph per topology', () => {
  const draw = (members: AgUiTeamMember[], statuses?: ReadonlyMap<string, 'working' | 'done' | 'waiting' | 'failed'>, topology?: AgUiTeamMember['topology']) =>
    render(<TeamGraph controller={new ChatController()} members={members} statuses={statuses} topology={topology} />).container;

  it('draws a numbered chain with an arrow into each next member', () => {
    const c = draw(teamMembersFromStructure(structure('sequential', 5)));
    expect(c.querySelector('svg')!.getAttribute('data-topology')).toBe('sequential');
    expect(c.querySelectorAll('.ag-team-graph__node')).toHaveLength(5);
    expect([...c.querySelectorAll('.ag-team-graph__order')].map((o) => o.textContent)).toEqual(['1', '2', '3', '4', '5']);
    expect(c.querySelectorAll('.ag-team-graph__edge')).toHaveLength(4);
    expect(c.querySelectorAll('.ag-team-graph__head')).toHaveLength(4);
  });

  it('lights the link into the member at work, and the ones already travelled', () => {
    const statuses = new Map([['m1', 'done'], ['m2', 'done'], ['m3', 'working']] as const);
    const c = draw(teamMembersFromStructure(structure('sequential', 4)), statuses);
    expect([...c.querySelectorAll('.ag-team-graph__edge')].map((e) => e.getAttribute('data-status'))).toEqual(['done', 'working', 'idle']);
  });

  it('draws parallel members in a band when there are many, with the start and the join', () => {
    const c = draw(teamMembersFromStructure(structure('concurrent', 9)));
    expect(c.querySelector('svg')!.getAttribute('data-topology')).toBe('concurrent');
    expect(c.querySelector('.ag-team-graph__band')).not.toBeNull();
    expect(c.querySelectorAll('.ag-team-graph__dot')).toHaveLength(2);
  });

  it('lights the join only once every parallel member is done', () => {
    const half = draw(teamMembersFromStructure(structure('concurrent', 8)), new Map([['m1', 'done']] as const));
    expect([...half.querySelectorAll('.ag-team-graph__edge')].map((e) => e.getAttribute('data-status'))).toEqual(['done', 'idle']);
    const all = draw(teamMembersFromStructure(structure('concurrent', 8)), new Map(ids(8).map((id) => [id, 'done'] as const)));
    expect([...all.querySelectorAll('.ag-team-graph__edge')].map((e) => e.getAttribute('data-status'))).toEqual(['done', 'done']);
  });

  it('draws the links of a handoff team with their heads, and a way in', () => {
    const c = draw(teamMembersFromStructure(structure('handoff', 4, [[1, 2], [2, 3], [3, 2]])));
    expect(c.querySelector('svg')!.getAttribute('data-topology')).toBe('handoff');
    expect(c.querySelectorAll('.ag-team-graph__edge')).toHaveLength(4); // 3 links + the entry
    expect(c.querySelectorAll('.ag-team-graph__dot')).toHaveLength(1);
  });

  it('draws a group chat around a shared conversation that lights up while anyone speaks', () => {
    const c = draw(teamMembersFromStructure(structure('group-chat', 5)), new Map([['m3', 'working']] as const));
    expect(c.querySelector('svg')!.getAttribute('data-topology')).toBe('group-chat');
    expect(c.querySelector('.ag-team-graph__center')!.getAttribute('data-status')).toBe('working');
    expect(c.querySelectorAll('.ag-team-graph__edge')).toHaveLength(5);
  });

  it('keeps the constellation for a manager-led team', () => {
    const team = structure('manager-led', 4, [], 1);
    const c = render(<TeamGraph controller={new ChatController()} members={teamMembersFromStructure(team)} hubMemberId="m1" />).container;
    expect(c.querySelector('svg')!.getAttribute('data-topology')).toBe('constellation');
    expect(c.querySelectorAll('.ag-team-graph__node')).toHaveLength(4);
    expect(c.querySelector('.ag-team-graph__head')).toBeNull();
  });

  it('keeps the constellation for members that say nothing about their topology', () => {
    const c = draw([{ memberEntityId: 'a', displayName: 'A' }, { memberEntityId: 'b', displayName: 'B' }]);
    expect(c.querySelector('svg')!.getAttribute('data-topology')).toBe('constellation');
  });

  it('takes the topology from its own prop when the members carry none', () => {
    const c = draw([{ memberEntityId: 'a', displayName: 'A' }, { memberEntityId: 'b', displayName: 'B' }], undefined, { kind: 'sequential', links: [] });
    expect(c.querySelector('svg')!.getAttribute('data-topology')).toBe('sequential');
  });
});

// ── groups on every topology ────────────────────────────────────────────────────────────────────────────────────────────

import { groupsFor, pillWidth } from '../src/chat/components/team-layouts.js';

describe('groups on every topology', () => {
  const GROUPS = ['Intake', 'Intake', 'Stores', 'Stores', 'Analysis', 'Analysis', 'Analysis', 'Analysis', 'Report'];
  const groupedStructure = (orchestratorId: string, order: number[] = ids(9).map((_, i) => i)): TeamStructure => {
    const base = structure(orchestratorId, 9, orchestratorId === 'sequential' ? Array.from({ length: 8 }, (_, i) => [i + 1, i + 2] as [number, number]) : []);
    return { ...base, members: order.map((i) => ({ ...base.members[i]!, group: GROUPS[i] })) };
  };
  const SCATTERED = [0, 2, 4, 8, 1, 3, 5, 6, 7];

  const boxOf = (label: { x: number; y: number }, name: string) => ({ left: label.x - pillWidth(name) / 2, right: label.x + pillWidth(name) / 2, top: label.y - 8, bottom: label.y + 8 });
  const touches = (a: { left: number; right: number; top: number; bottom: number }, at: { x: number; y: number }) => a.left < at.x + 20 && a.right > at.x - 20 && a.top < at.y + 20 && a.bottom > at.y - 20;

  for (const kind of ['sequential', 'concurrent', 'handoff', 'group-chat'] as const) {
    it(`${kind}: every group gets a zone and a named badge in the frame, clear of every member`, () => {
      const members = teamMembersFromStructure(groupedStructure(kind));
      const scene = sceneFor(kind, members.map((m) => m.memberEntityId), members[0]!.topology!.links, FRAME, (id) => members.find((m) => m.memberEntityId === id)?.group)!;
      const groups = groupsFor(scene, (id) => { const g = members.find((m) => m.memberEntityId === id)?.group; return g ? { key: g.toLowerCase(), name: g } : undefined; }, FRAME);

      expect(groups.map((g) => g.name)).toEqual(['Intake', 'Stores', 'Analysis', 'Report']);
      expect(groups.map((g) => g.ids.length)).toEqual([2, 2, 4, 1]);
      for (const g of groups) {
        const box = boxOf(g.label, g.name);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(FRAME.width);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(FRAME.height);
        for (const m of scene.members) expect(touches(box, m.at), `${g.name} badge on ${m.id}`).toBe(false);
      }
    });

    it(`${kind}: the page shows each group's name and a zone behind it`, () => {
      const c = render(<TeamGraph controller={new ChatController()} members={teamMembersFromStructure(groupedStructure(kind))} />).container;
      expect([...c.querySelectorAll('.ag-team-graph__group')].map((t) => t.textContent)).toEqual(['INTAKE', 'STORES', 'ANALYSIS', 'REPORT']);
      expect([...c.querySelectorAll('.ag-team-graph__count')].map((t) => t.textContent)).toEqual(['2', '2', '4', '1']);
      expect(c.querySelectorAll('.ag-team-graph__zone')).toHaveLength(4);
    });
  }

  it('a team with no groups draws no badge and no zone', () => {
    const plain = structure('handoff', 4);
    const ungrouped = { ...plain, members: plain.members.map((m) => ({ ...m, group: undefined })) };
    const c = render(<TeamGraph controller={new ChatController()} members={teamMembersFromStructure(ungrouped)} />).container;
    expect(c.querySelectorAll('.ag-team-graph__badge')).toHaveLength(0);
    expect(c.querySelectorAll('.ag-team-graph__zone')).toHaveLength(0);
  });

  it('keeps the members of a group together when the definition mixes them up (every layout but the chain)', () => {
    const members = teamMembersFromStructure(groupedStructure('concurrent', SCATTERED));
    const scene = sceneFor('concurrent', members.map((m) => m.memberEntityId), [], FRAME, (id) => members.find((m) => m.memberEntityId === id)?.group)!;
    // the graph orders by group first; here the scene is asked directly, so check what the graph does through its badges
    const c = render(<TeamGraph controller={new ChatController()} members={members} />).container;
    expect([...c.querySelectorAll('.ag-team-graph__group')].map((t) => t.textContent)).toEqual(['INTAKE', 'STORES', 'ANALYSIS', 'REPORT']); // one badge per group, not per scattered fragment
    expect(scene.members).toHaveLength(9);
  });

  it('concurrent: a group fills rows of its own, never sharing a row with another group', () => {
    const members = teamMembersFromStructure(groupedStructure('concurrent'));
    const groupOf = (id: string) => members.find((m) => m.memberEntityId === id)?.group;
    const scene = concurrentScene(members.map((m) => m.memberEntityId), FRAME, groupOf);
    const rows = new Map<number, Set<string | undefined>>();
    for (const m of scene.members) {
      const y = Math.round(m.at.y);
      rows.set(y, (rows.get(y) ?? new Set()).add(groupOf(m.id)));
    }
    for (const groupsInRow of rows.values()) expect(groupsInRow.size).toBe(1);
  });

  it('a chain split by another group draws one zone and badge per run of consecutive members', () => {
    const c = render(<TeamGraph controller={new ChatController()} members={teamMembersFromStructure(groupedStructure('sequential', SCATTERED))} />).container;
    // Intake, Stores, Analysis, Report, Intake, Stores, Analysis(3): the order of the chain is the team's
    expect(c.querySelectorAll('.ag-team-graph__badge')).toHaveLength(7);
    expect(c.querySelectorAll('.ag-team-graph__zone')).toHaveLength(7);
  });

  it('the constellation of a manager-led team still shows its groups', () => {
    const team = groupedStructure('manager-led');
    const c = render(<TeamGraph controller={new ChatController()} members={teamMembersFromStructure(team)} hubMemberId="m9" />).container;
    expect(c.querySelectorAll('.ag-team-graph__badge').length).toBeGreaterThan(0);
  });
});

describe('a chain in a tall, narrow frame (a side panel)', () => {
  const tall: SceneFrame = { width: 300, height: 808, center: { x: 150, y: 404 }, ring: { x: 102, y: 142 } };

  it('keeps its rows close together and centers the chain vertically', () => {
    const scene = sequentialScene(Array.from({ length: 9 }, (_, i) => `m${i}`), [], tall);
    const ys = [...new Set(scene.members.map((m) => Math.round(m.at.y)))].sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(2);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeLessThanOrEqual(118);
    const top = ys[0]!;
    const bottom = ys[ys.length - 1]!;
    expect(Math.abs((top + bottom) / 2 - tall.height / 2)).toBeLessThan(2);
  });
});
