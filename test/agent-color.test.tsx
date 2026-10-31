import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TemplateGraph } from '../src/graph/TemplateGraph.js';

const agent = (metadata?: Record<string, unknown>) => ({
  id: 'a',
  name: 'A',
  graph: { id: 'g', name: 'G', entryNode: 'ai', metadata, nodes: [{ id: 'ai', nodeType: 'ai.node' }], connections: [] },
});
const color = (container: HTMLElement) => container.querySelector<SVGElement>('.ag-workflow-graph')!.style.getPropertyValue('--ag-workflow-start');

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
