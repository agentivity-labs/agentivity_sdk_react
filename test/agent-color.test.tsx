import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TemplateGraph } from '../src/graph/TemplateGraph.js';

const agent = (metadata?: Record<string, unknown>) => ({
  id: 'a',
  name: 'A',
  graph: { id: 'g', name: 'G', entryNode: 'ai', metadata, nodes: [{ id: 'ai', nodeType: 'ai.node' }], connections: [] },
});
const color = (container: HTMLElement) => container.querySelector<SVGElement>('.ag-workflow-graph')!.style.getPropertyValue('--ag-workflow-node');

describe('the groups of a workflow', () => {
  const step = (id: string, group?: string) => ({ id, nodeType: 'ai.node', metadata: { displayName: id, ...(group ? { group } : {}) } });
  const workflow = (metadata?: Record<string, unknown>) => ({
    id: 'w',
    name: 'W',
    entryNode: 'a',
    metadata,
    nodes: [step('a', 'Crew'), step('b', 'Crew'), step('c')],
    connections: [{ from: 'a', to: 'b', fromPort: 'out', toPort: 'in' }, { from: 'b', to: 'c', fromPort: 'out', toPort: 'in' }],
  });

  it('are drawn behind their steps, under their name', () => {
    const { container } = render(<TemplateGraph source={workflow()} />);

    expect(container.querySelectorAll('.ag-team-graph__zone')).toHaveLength(1);
    expect(container.querySelector('.ag-workflow-graph__group')?.textContent).toBe('CREW');
  });

  it('wear the color chosen for them', () => {
    const { container } = render(<TemplateGraph source={workflow({ groupColors: { crew: '#123456' } })} />);

    expect((container.querySelector('.ag-team-graph__zone')!.parentElement as unknown as SVGElement).style.color).toBe('rgb(18, 52, 86)');
  });

  it('give their color to their steps, and a step without a group has none', () => {
    const { container } = render(<TemplateGraph source={workflow({ groupColors: { crew: '#123456' } })} />);
    const nodes = container.querySelectorAll<SVGElement>('.ag-workflow-graph__node');

    expect(nodes[0]!.style.color).toBe('rgb(18, 52, 86)');
    expect(nodes[2]!.style.color).toBe('');
  });

  it('leave a workflow without groups as it is', () => {
    const { container } = render(<TemplateGraph source={{ ...workflow(), nodes: [step('a'), step('b'), step('c')] }} />);

    expect(container.querySelector('.ag-team-graph__zone')).toBeNull();
  });
});

describe('the color of the group of an agent', () => {
  it('is worn by its graph', () => {
    const { container } = render(<TemplateGraph source={agent({ group: 'Sales', groupColor: '#123456' })} />);

    expect(color(container)).toBe('#123456');
  });

  it('leaves the default colors when there is none', () => {
    const { container } = render(<TemplateGraph source={agent()} />);

    expect(color(container)).toBe('');
  });

  it('leaves the default colors when it is not a color', () => {
    const { container } = render(<TemplateGraph source={agent({ group: 'Sales', groupColor: 'red; x' })} />);

    expect(color(container)).toBe('');
  });
});
