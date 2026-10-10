import { describe, expect, it } from 'vitest';
import { RenderableError, resolveRenderable, tryResolveRenderable } from '../src/graph/renderable.js';

const team = {
  id: 'team-1',
  name: 'SEO team',
  role: 'Turns a keyword into a reviewed article.',
  orchestratorId: 'manager-led',
  managerAgentId: 'p1',
  members: [
    { topologyPositionId: 'p1', memberEntityId: 'a-writer', memberType: 'agent' },
    { topologyPositionId: 'p2', memberEntityId: 'a-reviewer', memberType: 'agent' },
  ],
  connections: [],
};
const writer = { id: 'a-writer', name: 'Writer', role: 'Writes the draft', tags: ['seo'], graph: { id: 'g1', entryNode: 'agent', nodes: [{ id: 'agent', nodeType: 'ai.node', inputs: {} }], connections: [] } };
const reviewer = { id: 'a-reviewer', name: 'Reviewer', graph: { id: 'g2', entryNode: 'agent', nodes: [{ id: 'agent', nodeType: 'ai.node', inputs: {} }], connections: [] } };
const workflow = {
  id: 'wf-1',
  name: 'Publish',
  entryNode: 'start',
  nodes: [
    { id: 'start', nodeType: 'core.start', inputs: {} },
    { id: 'send', nodeType: 'core.http', inputs: {} },
  ],
  connections: [{ from: 'start', to: 'send', fromPort: 'out', toPort: 'in' }],
};

const templateFile = (extra: Record<string, unknown> = {}) => ({
  schema: 'agentivity.template',
  schemaVersion: 1,
  id: 'seo-factory',
  version: '1.0.0',
  name: 'SEO factory',
  root: { kind: 'team', id: 'team-1' },
  entities: [
    { kind: 'team', id: 'team-1', name: 'SEO team', entry: team },
    { kind: 'agent', id: 'a-writer', name: 'Writer', entry: writer },
    { kind: 'agent', id: 'a-reviewer', name: 'Reviewer', entry: reviewer },
    { kind: 'workflow', id: 'wf-1', name: 'Publish', entry: workflow },
  ],
  ...extra,
});

describe('resolveRenderable — a Template file', () => {
  it('is the graph of its root, with the other entities giving names', () => {
    const r = resolveRenderable(templateFile());
    expect(r.kind).toBe('team');
    expect(r.id).toBe('team-1');
    expect(r.name).toBe('SEO team');
    expect(r.entity['orchestratorId']).toBe('manager-led');
    expect(r.entitiesById.get('a-writer')).toEqual({ kind: 'agent', id: 'a-writer', name: 'Writer', role: 'Writes the draft', tags: ['seo'] });
    expect(r.entitiesById.get('a-reviewer')?.name).toBe('Reviewer');
    expect(r.template).toEqual({ id: 'seo-factory', name: 'SEO factory', version: '1.0.0' });
  });

  it('can have a workflow or an agent as its root', () => {
    expect(resolveRenderable(templateFile({ root: { kind: 'workflow', id: 'wf-1' } })).kind).toBe('workflow');
    expect(resolveRenderable(templateFile({ root: { kind: 'agent', id: 'a-writer' } })).kind).toBe('agent');
  });

  it('still reads the older catalog wrapper for an entity', () => {
    const file = templateFile();
    (file.entities[0] as Record<string, unknown>) = { kind: 'team', id: 'team-1', name: 'SEO team', entryJson: JSON.stringify(team) };
    expect(resolveRenderable(file).entity['name']).toBe('SEO team');
  });

  it('says when the root is missing or not something to draw', () => {
    expect(() => resolveRenderable(templateFile({ root: { kind: 'team', id: 'nope' } }))).toThrowError(expect.objectContaining({ code: 'root_not_found' }));
    const table = templateFile({ root: { kind: 'datatable', id: 'tbl' }, entities: [{ kind: 'datatable', id: 'tbl', name: 'T', entry: { id: 'tbl', columns: [] } }] });
    expect(() => resolveRenderable(table)).toThrowError(expect.objectContaining({ code: 'unsupported_kind' }));
  });
});

describe('resolveRenderable — what the marketplace serves', () => {
  it('reads the root payload: the wrapper and the members map', () => {
    const payload = {
      kind: 'team',
      name: 'SEO team',
      entryJson: JSON.stringify(team),
      members: { 'a-writer': { kind: 'agent', name: 'Writer', role: 'Writes the draft', tags: [] }, 'a-reviewer': { kind: 'agent', name: 'Reviewer' } },
    };
    const r = resolveRenderable(payload);
    expect(r.kind).toBe('team');
    expect(r.entitiesById.get('a-writer')?.role).toBe('Writes the draft');
    expect(r.entitiesById.get('a-reviewer')?.name).toBe('Reviewer');
    expect(r.template).toBeUndefined();
  });

  it('reads the wrapper alone, with the entity as an object or as a JSON text', () => {
    expect(resolveRenderable({ kind: 'workflow', name: 'Publish', entryJson: workflow }).kind).toBe('workflow');
    const r = resolveRenderable({ kind: 'agent', name: 'Writer', entryJson: JSON.stringify(writer) });
    expect(r.kind).toBe('agent');
    expect(r.entitiesById.size).toBe(0);
  });
});

describe('resolveRenderable — bare entities and text', () => {
  it('tells a team, a workflow and an agent apart by their shape', () => {
    expect(resolveRenderable(team).kind).toBe('team');
    expect(resolveRenderable(workflow).kind).toBe('workflow');
    expect(resolveRenderable(writer).kind).toBe('agent');
  });

  it('accepts the JSON text of any of them', () => {
    expect(resolveRenderable(JSON.stringify(templateFile())).kind).toBe('team');
    expect(resolveRenderable(JSON.stringify(workflow)).kind).toBe('workflow');
  });
});

describe('resolveRenderable — what it refuses', () => {
  it('names the problem', () => {
    expect(() => resolveRenderable('not json')).toThrowError(expect.objectContaining({ code: 'not_json' }));
    expect(() => resolveRenderable(42)).toThrowError(expect.objectContaining({ code: 'not_an_object' }));
    expect(() => resolveRenderable([])).toThrowError(expect.objectContaining({ code: 'not_an_object' }));
    expect(() => resolveRenderable({ hello: 'world' })).toThrowError(expect.objectContaining({ code: 'unsupported_kind' }));
    expect(() => resolveRenderable({ kind: 'datatable', name: 'T', entryJson: { columns: [] } })).toThrowError(expect.objectContaining({ code: 'unsupported_kind' }));
    expect(() => resolveRenderable({ kind: 'team', entryJson: '{broken' })).toThrowError(expect.objectContaining({ code: 'unreadable_entity' }));
    expect(() => resolveRenderable('not json')).toThrowError(RenderableError);
  });

  it('has a quiet version', () => {
    expect(tryResolveRenderable('not json')).toBeUndefined();
    expect(tryResolveRenderable(team)?.kind).toBe('team');
  });
});

describe('resolveRenderable — the marketplace envelope', () => {
  it('takes off { data } and reads what is inside', () => {
    const payload = { kind: 'team', name: 'SEO team', entryJson: JSON.stringify(team), members: { 'a-writer': { kind: 'agent', name: 'Writer' } } };
    const r = resolveRenderable({ data: payload });
    expect(r.kind).toBe('team');
    expect(r.entitiesById.get('a-writer')?.name).toBe('Writer');
    expect(resolveRenderable({ data: templateFile(), meta: { total: 1 } }).template?.id).toBe('seo-factory');
    expect(resolveRenderable(JSON.stringify({ data: workflow })).kind).toBe('workflow');
  });

  it('does not mistake an entity that has a `data` field for an envelope', () => {
    expect(resolveRenderable({ ...workflow, data: { whatever: 1 } }).kind).toBe('workflow');
  });
});
