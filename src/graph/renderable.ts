/**
 * What a graph can be drawn from. The platform, the marketplace and the files people share all describe the same entities
 * (a team, a workflow, an agent) in slightly different envelopes; `resolveRenderable` accepts any of them and hands back the
 * one thing to draw, with the names and roles of what it points to.
 *
 * Accepted sources (an object, or the JSON text of one):
 * - a **Template file** (`schema: "agentivity.template"`): the graph of its `root`, the other entities giving names to members;
 * - the **root payload** of the marketplace (`GET /templates/{id}/root`): the catalog wrapper `{ kind, name, entryJson }` plus
 *   a `members` map (id → name, role, tags) for the entities it references;
 * - the catalog **wrapper** alone (`{ kind, name, entryJson }`, `entryJson` being an object or a JSON string);
 * - a **bare entity** as the platform stores it (a team with `members`, a workflow with `nodes`, an agent with `graph`).
 *
 * Any of them may come still wrapped in the marketplace's answer envelope (`{ data: ... }`): it is taken off.
 */

export type RenderableKind = 'team' | 'workflow' | 'agent';

/** What a drawing needs to know about an entity the root points to. */
export interface RenderableEntity {
  kind: string;
  id: string;
  name: string;
  role?: string;
  tags: string[];
}

export interface Renderable {
  kind: RenderableKind;
  id: string;
  name: string;
  /** The entity to draw, as an object (the platform's own JSON). */
  entity: Record<string, unknown>;
  /** Names and roles of the entities the root points to, by id (empty for a bare entity or a bare wrapper). */
  entitiesById: ReadonlyMap<string, RenderableEntity>;
  /** Set when the source was a Template file. */
  template?: { id: string; name: string; version?: string };
}

export class RenderableError extends Error {
  constructor(
    readonly code: 'not_json' | 'not_an_object' | 'unreadable_entity' | 'unsupported_kind' | 'root_not_found',
    message: string,
  ) {
    super(message);
    this.name = 'RenderableError';
  }
}

type Rec = Record<string, unknown>;

const KINDS: readonly string[] = ['team', 'workflow', 'agent'];

const isRec = (value: unknown): value is Rec => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/** The entity inside an item: `entry` (an object), or the older `entryJson` (an object, or a JSON text). */
function entryOf(item: Rec): Rec | undefined {
  if (isRec(item['entry'])) return item['entry'];
  const wrapped = item['entryJson'];
  if (isRec(wrapped)) return wrapped;
  if (typeof wrapped === 'string') {
    try {
      const parsed: unknown = JSON.parse(wrapped);
      return isRec(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function describe(kind: string, id: string, name: string | undefined, entry: Rec | undefined): RenderableEntity {
  return { kind, id, name: name ?? text(entry?.['name']) ?? id, role: text(entry?.['role']), tags: strings(entry?.['tags']) };
}

/** What kind of entity a bare object is, from its shape. */
function guessKind(entity: Rec): RenderableKind | undefined {
  if (Array.isArray(entity['members']) && text(entity['orchestratorId']) !== undefined) return 'team';
  if (isRec(entity['graph']) && Array.isArray((entity['graph'] as Rec)['nodes'])) return 'agent';
  if (Array.isArray(entity['nodes'])) return 'workflow';
  return undefined;
}

function toKind(value: unknown): RenderableKind | undefined {
  const kind = text(value)?.toLowerCase();
  return kind && KINDS.includes(kind) ? (kind as RenderableKind) : undefined;
}

function fromTemplate(file: Rec): Renderable {
  const items = (Array.isArray(file['entities']) ? file['entities'] : []).filter(isRec);
  const byId = new Map<string, RenderableEntity>();
  const entries = new Map<string, Rec>();
  for (const item of items) {
    const id = text(item['id']);
    const kind = text(item['kind']);
    if (!id || !kind) continue;
    const entry = entryOf(item);
    if (entry) entries.set(id, entry);
    byId.set(id, describe(kind, id, text(item['name']), entry));
  }

  const root = isRec(file['root']) ? file['root'] : undefined;
  const rootId = text(root?.['id']);
  const entity = rootId ? entries.get(rootId) : undefined;
  if (!rootId || !entity) throw new RenderableError('root_not_found', 'The Template does not contain its root.');
  const kind = toKind(root?.['kind']) ?? toKind(byId.get(rootId)?.kind);
  if (!kind) throw new RenderableError('unsupported_kind', 'The root of a Template is a team, a workflow or an agent.');
  return {
    kind,
    id: rootId,
    name: byId.get(rootId)?.name ?? text(entity['name']) ?? rootId,
    entity,
    entitiesById: byId,
    template: { id: text(file['id']) ?? '', name: text(file['name']) ?? '', version: text(file['version']) },
  };
}

function fromWrapper(wrapper: Rec): Renderable {
  const entity = entryOf(wrapper);
  if (!entity) throw new RenderableError('unreadable_entity', 'The entity inside the wrapper cannot be read.');
  const kind = toKind(wrapper['kind']) ?? guessKind(entity);
  if (!kind) throw new RenderableError('unsupported_kind', `This kind of item is not a graph (${text(wrapper['kind']) ?? 'unknown'}).`);
  const byId = new Map<string, RenderableEntity>();
  // The marketplace gives the entities the root points to as a map: id -> { kind, name, role, tags }.
  if (isRec(wrapper['members'])) {
    for (const [id, value] of Object.entries(wrapper['members'])) {
      if (isRec(value)) byId.set(id, { kind: text(value['kind']) ?? 'agent', id, name: text(value['name']) ?? id, role: text(value['role']), tags: strings(value['tags']) });
    }
  }
  const id = text(entity['id']) ?? '';
  return { kind, id, name: text(wrapper['name']) ?? text(entity['name']) ?? id, entity, entitiesById: byId };
}

function fromBare(entity: Rec): Renderable {
  const kind = guessKind(entity);
  if (!kind) throw new RenderableError('unsupported_kind', 'This object is not a team, a workflow or an agent.');
  const id = text(entity['id']) ?? '';
  return { kind, id, name: text(entity['name']) ?? id, entity, entitiesById: new Map() };
}

/** The one thing to draw from any of the accepted sources. Throws a {@link RenderableError} saying what is wrong. */
export function resolveRenderable(source: unknown): Renderable {
  let value = source;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new RenderableError('not_json', 'The text is not JSON.');
    }
  }
  if (!isRec(value)) throw new RenderableError('not_an_object', 'Nothing to draw: expected a Template, a team, a workflow or an agent.');
  // The marketplace answers { data: ... } (or { data, meta }): what to draw is inside.
  if (isRec(value['data']) && value['schema'] === undefined && !('entryJson' in value) && !('entry' in value) && guessKind(value) === undefined) return resolveRenderable(value['data']);
  if (value['schema'] === 'agentivity.template') return fromTemplate(value);
  if ('entryJson' in value || 'entry' in value) return fromWrapper(value);
  return fromBare(value);
}

/** Like {@link resolveRenderable}, but `undefined` instead of an error. */
export function tryResolveRenderable(source: unknown): Renderable | undefined {
  try {
    return resolveRenderable(source);
  } catch {
    return undefined;
  }
}
