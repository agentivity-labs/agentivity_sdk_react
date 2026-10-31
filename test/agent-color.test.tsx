import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TemplateGraph } from '../src/graph/TemplateGraph.js';

const agent = (metadata?: Record<string, unknown>) => ({
  id: 'a',
  name: 'A',
  graph: { id: 'g', name: 'G', entryNode: 'ai', metadata, nodes: [{ id: 'ai', nodeType: 'ai.node' }], connections: [] },
});
const color = (container: HTMLElement) => container.querySelector<SVGElement>('.ag-workflow-graph')!.style.getPropertyValue('--ag-workflow-start');

describe('the colors of a workflow', () => {
  const workflow = (metadata?: Record<string, unknown>) => ({ ...agent().graph, metadata });

  it('are worn by its graph, by type of step', () => {
    const { container } = render(<TemplateGraph source={workflow({ stepColors: { start: '#123456', end: '#654321' } })} />);
    const style = container.querySelector<SVGElement>('.ag-workflow-graph')!.style;

    expect(style.getPropertyValue('--ag-workflow-start')).toBe('#123456');
    expect(style.getPropertyValue('--ag-workflow-end')).toBe('#654321');
  });

  it('leave out what is not a color', () => {
    const { container } = render(<TemplateGraph source={workflow({ stepColors: { start: 'red; x' } })} />);

    expect(color(container)).toBe('');
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
