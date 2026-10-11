import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TemplateGraph } from '../src/graph/TemplateGraph.js';

const team = {
  id: 'team-1',
  name: 'SEO team',
  orchestratorId: 'manager-led',
  managerAgentId: 'p1',
  members: [
    { topologyPositionId: 'p1', memberEntityId: 'a-lead', memberType: 'agent', displayName: 'Lead' },
    { topologyPositionId: 'p2', memberEntityId: 'a-writer', memberType: 'agent', displayName: 'Writer' },
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
  ],
  connections: [{ from: 'start', to: 'think', fromPort: 'out', toPort: 'in' }],
};

// jsdom has no PointerEvent: without one a pointer event carries no position, and a press could not be told from a drag.
if (typeof window.PointerEvent === 'undefined') {
  (window as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {};
}

/** The selectable element whose title starts with `name`. */
const element = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll<SVGGElement>('[data-selectable="true"]')].find((g) => g.querySelector('title')?.textContent?.startsWith(name))!;

/** A press and a release, `moved` pixels apart, the release landing on the svg as it does when the graph captures the pointer. */
const press = (container: HTMLElement, target: Element, moved = 0) => {
  fireEvent.pointerDown(target, { clientX: 100, clientY: 100 });
  fireEvent.pointerUp(container.querySelector('svg')!, { clientX: 100 + moved, clientY: 100 });
};

describe('selecting in a TemplateGraph', () => {
  it('a press on a node of a workflow selects it', () => {
    const onSelect = vi.fn();
    const { container } = render(<TemplateGraph source={workflow} interactive onSelect={onSelect} />);
    press(container, element(container, 'Think'));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'node', id: 'think', displayName: 'Think' });
  });

  it('a press on a member of a team selects it, by the entity it stands for', () => {
    const onSelect = vi.fn();
    const { container } = render(<TemplateGraph source={team} interactive onSelect={onSelect} />);
    press(container, element(container, 'Writer'));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'member', id: 'a-writer', displayName: 'Writer' });
  });

  it('a press that moves is a drag of the graph, not a selection', () => {
    const onSelect = vi.fn();
    const { container } = render(<TemplateGraph source={workflow} interactive onSelect={onSelect} />);
    press(container, element(container, 'Think'), 40);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('the keyboard selects too, and the selected element is marked', () => {
    const onSelect = vi.fn();
    const { container } = render(<TemplateGraph source={workflow} onSelect={onSelect} selectedId="think" />);
    fireEvent.keyDown(element(container, 'Start'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith({ kind: 'node', id: 'start', displayName: 'Start' });
    expect(element(container, 'Think').getAttribute('data-selected')).toBe('true');
    expect(element(container, 'Start').getAttribute('data-selected')).toBeNull();
  });

  it('without onSelect the graph stays a picture', () => {
    const { container } = render(<TemplateGraph source={workflow} />);
    expect(container.querySelector('[data-selectable]')).toBeNull();
    expect(container.querySelector('svg')!.getAttribute('role')).toBe('img');
  });
});
