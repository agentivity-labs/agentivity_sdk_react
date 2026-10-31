import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeamGraph } from '../src/chat/components/TeamGraph.js';
import { TemplateGraph } from '../src/graph/TemplateGraph.js';
import { WorkflowGraph } from '../src/chat/components/WorkflowGraph.js';
import { TEAM_GROUP_PALETTE, teamGroupColors } from '../src/chat/components/team-groups.js';
import { DEFAULT_GRAPH_PALETTE, DEFAULT_GRAPH_PALETTE_ID, GRAPH_PALETTES, GraphPaletteProvider, definePalette, graphPaletteById, graphPaletteVars } from '../src/palettes/graph-palettes.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const member = (id: string, group?: string, groupColor?: string) => ({ memberEntityId: id, displayName: id, group, groupColor });
const workflow = { nodes: [{ id: 'a', displayName: 'A', nodeType: 'x', kind: 'start' as const }], edges: [], entryNodeId: 'a' };

describe('the palettes of the SDK', () => {
  it('are complete, each under a name of its own', () => {
    expect(GRAPH_PALETTES).toHaveLength(24);
    expect(new Set(GRAPH_PALETTES.map((p) => p.id)).size).toBe(24);
    for (const p of GRAPH_PALETTES) {
      expect(p.groups.length).toBeGreaterThanOrEqual(6);
      for (const color of [...p.groups, ...Object.values(p.steps), ...Object.values(p.states)]) expect(color).toMatch(HEX);
      expect(['light', 'dark', 'both']).toContain(p.suits);
    }
  });

  it('never show the member at work in the red of a failure', () => {
    for (const p of GRAPH_PALETTES) expect(p.states.working.toUpperCase(), p.id).not.toBe(p.states.failed.toUpperCase());
    expect(DEFAULT_GRAPH_PALETTE.states.working).not.toBe('#E11D3F');
  });

  it('give Modern, Red Blue Mauve by default', () => {
    expect(DEFAULT_GRAPH_PALETTE_ID).toBe('modern-red-blue-mauve');
    expect(TEAM_GROUP_PALETTE).toEqual(DEFAULT_GRAPH_PALETTE.groups);
  });
});

describe('a palette of your own', () => {
  it('is made from another, changing only what is given', () => {
    const mine = definePalette('corporate-azure', { id: 'acme', steps: { ai: '#123456' } });
    const azure = graphPaletteById('corporate-azure')!;

    expect(mine.id).toBe('acme');
    expect(mine.steps.ai).toBe('#123456');
    expect(mine.steps.human).toBe(azure.steps.human);
    expect(mine.groups).toEqual(azure.groups);
  });

  it('says so when it starts from a palette that does not exist', () => {
    expect(() => definePalette('nothing', {})).toThrow('nothing');
  });
});

describe('a graph', () => {
  const groupColor = (container: HTMLElement) => teamGroupColors(['Booking'], undefined, graphPaletteById('futurist-electric')!.groups).get('booking');

  it('takes the colors of the palette it is given', () => {
    const { container } = render(<WorkflowGraph structure={workflow} palette="sport-energy" />);
    const svg = container.querySelector<SVGElement>('.ag-workflow-graph')!;

    expect(svg.style.getPropertyValue('--ag-workflow-ai')).toBe(graphPaletteVars(graphPaletteById('sport-energy')!)['--ag-workflow-ai']);
  });

  it('gives its groups the colors of the palette, a group keeping the color chosen for it', () => {
    const { container } = render(<TeamGraph members={[member('a', 'Booking'), member('b', 'Money', '#123456')]} palette="futurist-electric" restingColors />);

    expect(groupColor(container)).toBe(graphPaletteById('futurist-electric')!.groups[0]);
    expect(container.innerHTML.toLowerCase()).toContain('rgb(18, 52, 86)');
  });

  it('gives a member outside every group the strong color of the palette', () => {
    const { container } = render(<TeamGraph members={[member('boss')]} palette="corporate-azure" restingColors />);

    expect(container.querySelector<SVGElement>('.ag-team-graph__glyph')!.style.color).toBe('rgb(10, 37, 64)');
  });

  it('takes the palette the app imposes, whatever its own', () => {
    const { container } = render(
      <GraphPaletteProvider palette="neon-night">
        <WorkflowGraph structure={workflow} palette="sport-energy" />
      </GraphPaletteProvider>,
    );
    const svg = container.querySelector<SVGElement>('.ag-workflow-graph')!;

    expect(svg.style.getPropertyValue('--ag-workflow-start')).toBe(graphPaletteById('neon-night')!.steps.start);
  });

  it('falls back on the default palette for a name it does not know', () => {
    const { container } = render(<WorkflowGraph structure={workflow} palette="gone" />);

    expect(container.querySelector<SVGElement>('.ag-workflow-graph')!.style.getPropertyValue('--ag-workflow-start')).toBe(DEFAULT_GRAPH_PALETTE.steps.start);
  });

  it('owes no color to the theme', () => {
    render(<div />);
    const css = readCss();
    const tokens = ['working', 'waiting', 'done', 'failed'].flatMap((s) => [`--ag-team-${s}`, `--ag-workflow-${s}`]).concat(['start', 'decision', 'human', 'ai', 'action', 'end'].map((k) => `--ag-workflow-${k}`));
    for (const name of tokens) expect(css.match(new RegExp(`^[ \\t]+${name}:[ \\t]*([^;]+);`, 'm'))?.[1], name).toMatch(HEX);
  });
});

describe('a Template graph', () => {
  const team = { id: 't', name: 'T', orchestratorId: 'sequential', palette: 'neon-night', members: [{ topologyPositionId: 'a', memberEntityId: 'a', memberType: 'agent', displayName: 'A', group: 'One' }], connections: [] };
  const flow = (metadata?: Record<string, unknown>) => ({ id: 'w', name: 'W', entryNode: 'a', metadata, nodes: [{ id: 'a', nodeType: 'x' }, { id: 'b', nodeType: 'x' }], connections: [{ from: 'a', to: 'b', fromPort: 'out', toPort: 'in' }] });
  const working = (container: HTMLElement) => container.querySelector<SVGElement>('svg')!.style.getPropertyValue('--ag-team-working');

  it('gives a team the palette it is asked for', () => {
    const { container } = render(<TemplateGraph source={team} palette="sport-energy" />);

    expect(working(container)).toBe(graphPaletteById('sport-energy')!.states.working);
  });

  it('gives a team the palette it chose', () => {
    const { container } = render(<TemplateGraph source={team} />);

    expect(working(container)).toBe(graphPaletteById('neon-night')!.states.working);
  });

  it('gives a workflow the palette it keeps in its metadata', () => {
    const { container } = render(<TemplateGraph source={flow({ palette: 'sport-energy' })} />);

    expect(container.querySelector<SVGElement>('.ag-workflow-graph')!.style.getPropertyValue('--ag-workflow-ai')).toBe(graphPaletteById('sport-energy')!.steps.ai);
  });

  it('gives a workflow the palette it is asked for, over its own', () => {
    const { container } = render(<TemplateGraph source={flow({ palette: 'sport-energy' })} palette="neon-night" />);

    expect(container.querySelector<SVGElement>('.ag-workflow-graph')!.style.getPropertyValue('--ag-workflow-ai')).toBe(graphPaletteById('neon-night')!.steps.ai);
  });
});

function readCss(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/styles.css'), 'utf8');
}
