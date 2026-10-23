import { describe, expect, it } from 'vitest';
import { parseWorkflowEntity } from '../src/client/domain/workflow-models.js';
import { parseCatalogBrowseItem } from '../src/client/domain/agent-models.js';

describe('the outputs a workflow declares', () => {
  it('are read with the workflow', () => {
    const workflow = parseWorkflowEntity({
      id: 'wf',
      name: 'Picks a trip',
      outputs: [
        { name: 'output', value: 'A trip to {{pick.city}}' },
        { name: ' city ', value: '{{pick.city}}', description: ' The city chosen ' },
        'not an output',
      ],
    });

    expect(workflow.outputs).toEqual([
      { name: 'output', value: 'A trip to {{pick.city}}' },
      { name: 'city', value: '{{pick.city}}', description: 'The city chosen' },
    ]);
  });

  it('are none when the workflow declares none', () => {
    expect(parseWorkflowEntity({ id: 'wf', name: 'Plain' }).outputs).toEqual([]);
  });
});

describe('an item of the catalog', () => {
  it('carries its tags, "solution" for what a person launches', () => {
    expect(parseCatalogBrowseItem({ id: 'a', name: 'Trip planner', type: 'agent', tags: ['solution', ' travel ', ''] }).tags).toEqual(['solution', 'travel']);
    expect(parseCatalogBrowseItem({ id: 'b', name: 'Helper', type: 'agent' }).tags).toEqual([]);
  });
});
