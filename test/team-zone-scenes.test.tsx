import { act, render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TemplateGraph } from '../src/graph/TemplateGraph.js';

// Whole teams, drawn by the real component in every layout and several frames: whatever the team and the layout, the zone
// of a group never passes over a member that is not its own.

type M = [name: string, group?: string];
const team = (orchestratorId: string, members: M[], opts: { manager?: number; links?: [number, number][] } = {}) => ({
  id: 't',
  name: 'Team',
  orchestratorId,
  managerAgentId: opts.manager === undefined ? undefined : `p${opts.manager}`,
  members: members.map(([displayName, group], i) => ({ topologyPositionId: `p${i}`, memberEntityId: `m${i}`, memberType: 'agent', displayName, group })),
  connections: (opts.links ?? []).map(([a, b]) => ({ fromTopologyPositionId: `p${a}`, toTopologyPositionId: `p${b}`, types: ['delegate'] })),
});

/** A travel agency: a manager and twelve specialists in four groups of very different sizes. */
const agency: M[] = [
  ['Trip Manager'],
  ['On-Trip', 'Support'],
  ['Payment', 'Money'],
  ['Reservations', 'Money'],
  ['Flight', 'Booking'],
  ['Hotel', 'Booking'],
  ['Car Rental', 'Booking'],
  ['Restaurant & Dining', 'Booking'],
  ['Ground Transport', 'Booking'],
  ['Travel Insurance', 'Booking'],
  ['Activity Planner', 'Advice'],
  ['Visa & Documents', 'Advice'],
  ['Currency & Budget', 'Advice'],
];
/** The same agency with its groups shuffled through the team, as people really list their members. */
const shuffled: M[] = [agency[0]!, agency[4]!, agency[10]!, agency[2]!, agency[5]!, agency[1]!, agency[11]!, agency[6]!, agency[3]!, agency[7]!, agency[12]!, agency[8]!, agency[9]!];
const oneGroup: M[] = [['Trip Coord', 'Coordination'], ['Activities', 'Recommendations'], ['Flights', 'Recommendations'], ['Hotels', 'Recommendations']];
const seven: M[] = [['Lead', 'Lead'], ...['Flights', 'Hotels', 'Cars', 'Trains', 'Visa', 'Insurance', 'Dining'].map((n): M => [n, 'Services'])];

const teams: Record<string, M[]> = { agency, 'agency, groups shuffled': shuffled, 'one group round the manager': oneGroup, 'one group of seven': seven };
const layouts = ['manager-led', 'sequential', 'concurrent', 'handoff', 'group-chat'];
const frames = [
  { width: 400, height: 380 },
  { width: 760, height: 340 },
  { width: 300, height: 560 },
];

let box = frames[0]!;
const realObserver = globalThis.ResizeObserver;
beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    constructor(private readonly cb: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
    observe() {
      this.cb([{ contentRect: box }]);
    }
    disconnect() {}
  };
});
afterAll(() => {
  globalThis.ResizeObserver = realObserver;
});

interface P {
  x: number;
  y: number;
}
const HEX = 13;
const BAND = 23;
const num = (el: Element, name: string) => Number(el.getAttribute(name));
const near = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const toSegment = (p: P, a: P, b: P) => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const length = abx * abx + aby * aby;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / length));
  return near(p, { x: a.x + abx * t, y: a.y + aby * t });
};
const inside = (p: P, polygon: P[]) => {
  let within = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) within = !within;
  }
  return within;
};

/** Every member's hexagon that a zone passes over although it is not one of the zone's own members: `[]` is the rule kept. */
function trespasses(container: HTMLElement): string[] {
  const members = [...container.querySelectorAll('.ag-team-graph__node')].map((node) => {
    const [x = 0, y = 0] = (node.parentElement!.getAttribute('transform') ?? '').match(/-?[\d.]+/g)!.map(Number);
    return { name: node.querySelector('title')!.textContent!.split(' — ')[0]!, at: { x, y } };
  });
  const found: string[] = [];
  for (const zone of container.querySelectorAll('.ag-team-graph__zone')) {
    const lines = [...zone.querySelectorAll('line')].map((l) => ({ a: { x: num(l, 'x1'), y: num(l, 'y1') }, b: { x: num(l, 'x2'), y: num(l, 'y2') }, half: l.style.strokeWidth ? parseFloat(l.style.strokeWidth) / 2 : BAND }));
    // A filled zone is one polygon; an organic one adds the free areas between neighbours, a polygon each.
    const polygons = [...zone.querySelectorAll('polygon')].map((p) => (p.getAttribute('points') ?? '').split(' ').map((pair) => pair.split(',').map(Number)).map(([x = 0, y = 0]) => ({ x, y })));
    const own = [...lines.filter((l) => near(l.a, l.b) < 1).map((l) => l.a), ...polygons.flat()];
    for (const member of members) {
      if (own.some((p) => near(p, member.at) < 1)) continue;
      const underBand = lines.some((l) => toSegment(member.at, l.a, l.b) < l.half + HEX - 1);
      const underArea = polygons.some((polygon) => inside(member.at, polygon) || polygon.some((p, i) => toSegment(member.at, p, polygon[(i + 1) % polygon.length]!) < BAND + HEX - 1));
      if (underBand || underArea) found.push(member.name);
    }
  }
  return found;
}

describe('the zones of whole teams', () => {
  for (const [teamName, members] of Object.entries(teams)) {
    for (const layout of layouts) {
      for (const frame of frames) for (const look of ['bands', 'organic'] as const) {
        it(`${teamName}, ${layout}, ${frame.width}×${frame.height}, ${look}: no zone over a member of another group`, async () => {
          box = frame;
          const links = layout === 'handoff' ? members.map((_, i): [number, number] => [i, (i + 1) % members.length]) : [];
          const { container } = render(<TemplateGraph zoneLook={look} source={team(layout, members, { manager: layout === 'manager-led' ? 0 : undefined, links })} />);
          await act(async () => {});

          expect(container.querySelectorAll('.ag-team-graph__node')).toHaveLength(members.length);
          expect(trespasses(container)).toEqual([]);
        });
      }
    }
  }

  it('the check itself sees a zone drawn over a stranger (the drawing this replaced)', () => {
    const holder = document.createElement('div');
    const node = (name: string, x: number, y: number) => `<g transform="translate(${x} ${y})"><g class="ag-team-graph__node"><title>${name} — idle</title></g></g>`;
    holder.innerHTML = `<svg><g class="ag-team-graph__zone"><polygon points="200,60 330,270 70,270"/></g>${node('A', 200, 60)}${node('B', 330, 270)}${node('C', 70, 270)}${node('Manager', 200, 190)}</svg>`;
    expect(trespasses(holder)).toEqual(['Manager']);
  });

  it('the agency keeps a zone and a badge for each of its four groups', async () => {
    box = frames[0]!;
    const { container } = render(<TemplateGraph source={team('manager-led', agency, { manager: 0 })} />);
    await act(async () => {});

    expect([...container.querySelectorAll('.ag-team-graph__group')].map((g) => g.textContent).sort()).toEqual(['ADVICE', 'BOOKING', 'MONEY', 'SUPPORT']);
    expect(container.querySelectorAll('.ag-team-graph__zone')).toHaveLength(4);
  });
});
