import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { layoutWorkflowGraph } from '../src/chat/components/workflow-graph-layout.js';
import { parseWorkflowGraph } from '../src/client/domain/workflow-graph-models.js';
import { TemplateGraph } from '../src/graph/TemplateGraph.js';

// A chain of eight steps: long enough to be wider than what a readable scale can show.
const ids = ['start', 'read', 'think', 'route', 'write', 'check', 'send', 'end'];
const workflow = {
  id: 'wf-long',
  name: 'Long workflow',
  entryNode: 'start',
  nodes: ids.map((id) => ({ id, nodeType: id === 'start' ? 'core.start' : 'ai.llm.prompt', inputs: {}, metadata: { displayName: id } })),
  connections: ids.slice(1).map((to, i) => ({ from: ids[i], to, fromPort: 'out', toPort: 'in' })),
};
const source = { kind: 'workflow', name: 'Long workflow', entryJson: workflow };

const layout = layoutWorkflowGraph(parseWorkflowGraph(workflow));
// The scale of reading used by the chat: about 360 layout units in view (see `focusZoomFor`).
const k = Math.min(6, Math.max(0.4, layout.width / 360));
const centeredOn = (id: string) => {
  const at = layout.positions.get(id)!;
  return `translate(${(layout.width / 2 - at.x * k).toFixed(2)}px, ${(layout.height / 2 - at.y * k).toFixed(2)}px) scale(${k.toFixed(4)})`;
};
const FITTED = 'translate(0.00px, 0.00px) scale(1.0000)';

const viewport = (container: HTMLElement) => container.querySelector<HTMLElement>('.ag-workflow-graph__viewport')!.style.transform;
const frame = (container: HTMLElement) => container.querySelector<HTMLElement>('.ag-workflow-graph-fit')!;

describe('TemplateGraph — camera on a workflow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the whole diagram in a frame of its own ratio by default ('fit'), exactly as before", () => {
    const { container } = render(<TemplateGraph source={source} />);
    expect(frame(container).getAttribute('data-camera')).toBe('fit');
    expect(frame(container).style.aspectRatio.replace(/\s/g, '')).toBe(`${Math.round(layout.width)}/${Math.round(layout.height)}`);
    expect(viewport(container)).toBe(FITTED);
  });

  it("passes camera to the workflow: in 'follow' the frame no longer has the ratio of the diagram", () => {
    const { container } = render(<TemplateGraph source={source} camera="follow" />);
    expect(frame(container).getAttribute('data-camera')).toBe('follow');
    expect(frame(container).style.aspectRatio).toBe('');
  });

  it("opens on the start node at the reading scale, and stays there without autoplay", () => {
    const { container } = render(<TemplateGraph source={source} camera="follow" />);
    expect(viewport(container)).toBe(centeredOn('start'));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(viewport(container)).toBe(centeredOn('start'));
  });

  it('with autoplay, glides to each node that starts working, then back to the start when the loop begins again', () => {
    const { container } = render(<TemplateGraph source={source} camera="follow" autoplay stepMs={1000} />);
    expect(viewport(container)).toBe(centeredOn('start'));
    act(() => void vi.advanceTimersByTime(1000));
    expect(viewport(container)).toBe(centeredOn('read'));
    act(() => void vi.advanceTimersByTime(1000));
    expect(viewport(container)).toBe(centeredOn('think'));
    // The walk has 8 steps, then a round of "all done" and a round at rest: 10 steps in all, then it starts again. One tick at a time,
    // as a browser would deliver them (several ticks inside one act would be rendered once).
    const tick = () => act(() => void vi.advanceTimersByTime(1000));
    for (let i = 0; i < 5; i += 1) tick();
    expect(viewport(container)).toBe(centeredOn('end'));
    tick(); // everything done: the camera stays where it was
    tick(); // at rest
    expect(viewport(container)).toBe(centeredOn('end'));
    tick(); // the loop begins again
    expect(viewport(container)).toBe(centeredOn('start'));
  });

  it('does not move for a visitor who prefers reduced motion: a still picture on the start', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    const { container } = render(<TemplateGraph source={source} camera="follow" autoplay stepMs={500} />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(viewport(container)).toBe(centeredOn('start'));
    expect(container.querySelector('svg.ag-workflow-graph')!.getAttribute('data-run')).toBe('none');
  });

  it('a gesture of the visitor takes the camera until the recenter button gives it back', () => {
    const { container } = render(<TemplateGraph source={source} camera="follow" autoplay stepMs={1000} interactive />);
    expect(viewport(container)).toBe(centeredOn('start'));
    fireEvent.pointerDown(container.querySelector('svg.ag-workflow-graph')!);
    act(() => void vi.advanceTimersByTime(3000));
    expect(viewport(container)).toBe(centeredOn('start'));
    fireEvent.click(container.querySelector('.ag-workflow-graph__fit')!);
    // The button returns to the node that is active now.
    expect(viewport(container)).not.toBe(centeredOn('start'));
  });

  it("applies to the graph inside an agent too, and does not touch a team", () => {
    const agent = { id: 'a1', name: 'Solo', graph: { id: 'g', entryNode: 'start', nodes: workflow.nodes, connections: workflow.connections } };
    const solo = render(<TemplateGraph source={agent} camera="follow" />);
    expect(frame(solo.container).getAttribute('data-camera')).toBe('follow');
    expect(viewport(solo.container)).toBe(centeredOn('start'));

    const team = {
      id: 'team-1',
      name: 'Team',
      orchestratorId: 'manager-led',
      managerAgentId: 'p1',
      members: [
        { topologyPositionId: 'p1', memberEntityId: 'a-lead', memberType: 'agent' },
        { topologyPositionId: 'p2', memberEntityId: 'a-writer', memberType: 'agent' },
      ],
      connections: [],
    };
    const withFit = render(<TemplateGraph source={team} />);
    const withFollow = render(<TemplateGraph source={team} camera="follow" />);
    expect(withFollow.container.innerHTML).toBe(withFit.container.innerHTML);
    expect(withFollow.container.querySelector('.ag-workflow-graph-fit')).toBeNull();
  });
});
