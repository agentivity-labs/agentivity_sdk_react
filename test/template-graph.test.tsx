import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateGraph, workflowWalk } from '../src/graph/TemplateGraph.js';
import type { WorkflowGraphStructure } from '../src/client/domain/workflow-graph-models.js';

const agent = (id: string, name: string) => ({ id, name, graph: { id: 'g-' + id, entryNode: 'agent', nodes: [{ id: 'agent', nodeType: 'ai.node', inputs: {} }], connections: [] } });
const team = {
  id: 'team-1',
  name: 'SEO team',
  orchestratorId: 'manager-led',
  managerAgentId: 'p1',
  members: [
    { topologyPositionId: 'p1', memberEntityId: 'a-lead', memberType: 'agent' },
    { topologyPositionId: 'p2', memberEntityId: 'a-writer', memberType: 'agent' },
    { topologyPositionId: 'p3', memberEntityId: 'a-reviewer', memberType: 'agent' },
  ],
  connections: [],
};
const workflow = {
  id: 'wf-1',
  name: 'Publish',
  entryNode: 'start',
  nodes: [
    { id: 'start', nodeType: 'core.start', inputs: {}, metadata: { displayName: 'Start' } },
    { id: 'think', nodeType: 'ai.llm.prompt', inputs: {}, metadata: { displayName: 'Think' } },
    { id: 'send', nodeType: 'core.http', inputs: {}, metadata: { displayName: 'Send' } },
  ],
  connections: [
    { from: 'start', to: 'think', fromPort: 'out', toPort: 'in' },
    { from: 'think', to: 'send', fromPort: 'out', toPort: 'in' },
  ],
};
const template = {
  schema: 'agentivity.template',
  schemaVersion: 1,
  id: 'seo-factory',
  version: '1.0.0',
  name: 'SEO factory',
  root: { kind: 'team', id: 'team-1' },
  entities: [
    { kind: 'team', id: 'team-1', name: 'SEO team', entry: team },
    { kind: 'agent', id: 'a-lead', name: 'Content Manager', entry: agent('a-lead', 'Content Manager') },
    { kind: 'agent', id: 'a-writer', name: 'Writer', entry: agent('a-writer', 'Writer') },
    { kind: 'agent', id: 'a-reviewer', name: 'Reviewer', entry: agent('a-reviewer', 'Reviewer') },
  ],
};

describe('TemplateGraph — a still picture, with no run and no chat', () => {
  it('draws the team of a Template, naming each member from the Template', () => {
    const { container } = render(<TemplateGraph source={template} />);
    const svg = container.querySelector('svg.ag-team-graph');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('data-run')).toBe('none');
    const captions = [...container.querySelectorAll('.ag-team-graph__label')].map((n) => n.textContent);
    expect(captions).toEqual(expect.arrayContaining(['Writer', 'Reviewer']));
    expect(container.textContent).toContain('Content');
  });

  it('draws a workflow as its flow', () => {
    const { container } = render(<TemplateGraph source={{ kind: 'workflow', name: 'Publish', entryJson: workflow }} />);
    expect(container.querySelector('svg.ag-workflow-graph')).not.toBeNull();
    expect(container.querySelectorAll('.ag-workflow-graph__node')).toHaveLength(3);
    expect([...container.querySelectorAll('.ag-workflow-graph__label')].map((n) => n.textContent)).toEqual(expect.arrayContaining(['Start', 'Think', 'Send']));
  });

  it('draws the graph inside an agent', () => {
    const lead = { ...agent('a1', 'Solo'), graph: { id: 'g', entryNode: 'start', nodes: workflow.nodes, connections: workflow.connections } };
    const { container } = render(<TemplateGraph source={lead} />);
    expect(container.querySelectorAll('.ag-workflow-graph__node')).toHaveLength(3);
  });

  it('accepts the JSON text of a Template', () => {
    const { container } = render(<TemplateGraph source={JSON.stringify(template)} />);
    expect(container.querySelector('svg.ag-team-graph')).not.toBeNull();
  });

  it('says so instead of throwing when there is nothing to draw', () => {
    const { container, getByRole } = render(<TemplateGraph source={{ hello: 'world' }} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(getByRole('img').textContent).toMatch(/not a team, a workflow or an agent/i);
    const empty = render(<TemplateGraph source={{ kind: 'workflow', name: 'Empty', entryJson: { id: 'w', nodes: [], connections: [] } }} />);
    expect(empty.container.textContent).toMatch(/no steps to draw/i);
  });
});

describe('TemplateGraph — autoplay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lights the members up one after the other, then rests', () => {
    const { container } = render(<TemplateGraph source={template} autoplay stepMs={1000} />);
    const run = () => container.querySelector('svg.ag-team-graph')!.getAttribute('data-run');
    expect(run()).toBe('active');
    act(() => void vi.advanceTimersByTime(1000));
    expect(run()).toBe('active');
    // members: 3, then a round of "all done", then at rest
    act(() => void vi.advanceTimersByTime(3000));
    expect(run()).toBe('none');
  });

  it('does nothing unless asked to', () => {
    const { container } = render(<TemplateGraph source={template} />);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(container.querySelector('svg.ag-team-graph')!.getAttribute('data-run')).toBe('none');
  });

  it('stays still for a visitor who prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    const { container } = render(<TemplateGraph source={template} autoplay stepMs={500} />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(container.querySelector('svg.ag-team-graph')!.getAttribute('data-run')).toBe('none');
  });

  it('plays a workflow too', () => {
    const { container } = render(<TemplateGraph source={workflow} autoplay stepMs={500} />);
    expect([...container.querySelectorAll('.ag-workflow-graph__node')].some((n) => n.getAttribute('data-status') === 'working')).toBe(true);
  });
});

describe('workflowWalk — the order a run goes through a workflow', () => {
  const structure = (nodes: string[], edges: [string, string][], entry?: string): WorkflowGraphStructure => ({
    nodes: nodes.map((id) => ({ id, displayName: id, nodeType: '', kind: 'action' as const })),
    edges: edges.map(([from, to]) => ({ from, to })),
    entryNodeId: entry,
  });

  it('starts at the entry node and follows the edges', () => {
    expect(workflowWalk(structure(['c', 'a', 'b'], [['a', 'b'], ['b', 'c']], 'a'))).toEqual(['a', 'b', 'c']);
  });

  it('goes through each branch of a decision, and never loops', () => {
    expect(workflowWalk(structure(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'a']], 'a'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves what is not reachable for last', () => {
    expect(workflowWalk(structure(['a', 'b', 'lonely'], [['a', 'b']], 'a'))).toEqual(['a', 'b', 'lonely']);
  });
});

describe('TemplateGraph — a picture on a page that scrolls', () => {
  const wheel = (el: Element) => {
    const event = new WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true });
    el.dispatchEvent(event);
    return event;
  };

  it('leaves the wheel to the page by default: no zoom, no fit button', () => {
    const { container } = render(<TemplateGraph source={template} />);
    const svg = container.querySelector('svg.ag-team-graph')!;
    expect(svg.getAttribute('data-interactive')).toBe('false');
    expect(wheel(svg).defaultPrevented).toBe(false);
    expect(container.querySelector('.ag-team-graph__fit')).toBeNull();
  });

  it('does the same for a workflow', () => {
    const { container } = render(<TemplateGraph source={workflow} />);
    const svg = container.querySelector('svg.ag-workflow-graph')!;
    expect(svg.getAttribute('data-interactive')).toBe('false');
    expect(wheel(svg).defaultPrevented).toBe(false);
    expect(container.querySelector('.ag-workflow-graph__fit')).toBeNull();
  });

  it('zooms and offers to fit when asked to be interactive', () => {
    const team$ = render(<TemplateGraph source={template} interactive />);
    expect(wheel(team$.container.querySelector('svg.ag-team-graph')!).defaultPrevented).toBe(true);
    expect(team$.container.querySelector('.ag-team-graph__fit')).not.toBeNull();
    const flow$ = render(<TemplateGraph source={workflow} interactive />);
    expect(wheel(flow$.container.querySelector('svg.ag-workflow-graph')!).defaultPrevented).toBe(true);
    expect(flow$.container.querySelector('.ag-workflow-graph__fit')).not.toBeNull();
  });
});
