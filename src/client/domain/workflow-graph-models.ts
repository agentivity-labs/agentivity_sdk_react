/**
 * A minimal, display-only shape of a Workflow's node graph — enough to draw a flow diagram
 * (`WorkflowGraph`), never enough to edit one. Deliberately NOT the full node-editor model
 * ({@link WorkflowEntity}'s own doc comment calls that "Studio-editor territory", ~1100 lines in
 * the Flutter source, out of this SDK's scope) — this reads the same raw `GET /workflows/{id}`
 * response `WorkflowEntity` already discards `nodes`/`connections` from, but keeps only what a
 * flow diagram needs: a node's identity/kind and the *execution-flow* edges between them.
 */

/** A node's broad visual role — which icon/shape `WorkflowGraph` draws for it, not a platform concept. */
export type WorkflowNodeKind = 'start' | 'decision' | 'human' | 'ai' | 'end' | 'action';

export interface WorkflowGraphNode {
  id: string;
  displayName: string;
  /** The node's actual catalog type (e.g. `ai.llm.prompt`, `core.if`) — `kind` is derived from this. */
  nodeType: string;
  kind: WorkflowNodeKind;
}

export interface WorkflowGraphEdge {
  from: string;
  to: string;
  /** A branch condition's label (e.g. a `core.if` node's "Yes"/"No" — see `true_branch_label`/`false_branch_label`), when the source port carries one. */
  label?: string;
}

export interface WorkflowGraphStructure {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  entryNodeId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function str(json: Record<string, unknown>, key: string): string | undefined {
  const v = json[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function kindFor(nodeType: string): WorkflowNodeKind {
  if (nodeType === 'core.if' || nodeType.startsWith('core.switch')) return 'decision';
  if (nodeType.startsWith('interaction.')) return 'human';
  if (nodeType.startsWith('ai.')) return 'ai';
  return 'action';
}

function branchLabel(sourceRaw: Record<string, unknown> | undefined, port: string): string | undefined {
  const inputs = asRecord(sourceRaw?.['inputs']);
  const key = port === 'true' ? 'true_branch_label' : port === 'false' ? 'false_branch_label' : undefined;
  const explicit = key ? inputs?.[key] : undefined;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  // A non-default port with no explicit label still names its branch (e.g. a switch's case key) —
  // 'out'/'in' are the unlabeled default flow ports and never render a label.
  return port !== 'out' && port !== 'in' ? port : undefined;
}

/**
 * Parses the flow-diagram-relevant subset of a Workflow's raw definition — the same
 * `Record<string, unknown>` `EntitiesApi.fetchWorkflow` receives from `GET /workflows/{id}`
 * before narrowing it down to {@link WorkflowEntity}. Only nodes reachable through an
 * execution-flow edge (or the entry node) are kept — a resource/credential binding (an LLM
 * model, a chat channel, ...) always sources from a port literally named `resource`, so
 * filtering those out drops the wiring nodes (`ai.llm.model.*`, `ai.interactions.*` used as a
 * resource) along with them, leaving just the path a run actually walks.
 */
export function parseWorkflowGraph(json: Record<string, unknown>): WorkflowGraphStructure {
  const rawNodes = Array.isArray(json['nodes']) ? (json['nodes'] as unknown[]).map(asRecord).filter((n): n is Record<string, unknown> => !!n) : [];
  const rawConnections = Array.isArray(json['connections']) ? (json['connections'] as unknown[]).map(asRecord).filter((c): c is Record<string, unknown> => !!c) : [];
  const entryNodeId = str(json, 'entryNode');

  const nodeById = new Map<string, Record<string, unknown>>();
  for (const n of rawNodes) {
    const id = str(n, 'id');
    if (id) nodeById.set(id, n);
  }

  const edges: WorkflowGraphEdge[] = [];
  const referenced = new Set<string>();
  for (const c of rawConnections) {
    const from = str(c, 'from');
    const to = str(c, 'to');
    const fromPort = str(c, 'fromPort');
    if (!from || !to || fromPort === 'resource') continue;
    edges.push({ from, to, label: fromPort ? branchLabel(nodeById.get(from), fromPort) : undefined });
    referenced.add(from);
    referenced.add(to);
  }
  if (entryNodeId) referenced.add(entryNodeId);

  const hasOutgoing = new Set(edges.map((e) => e.from));
  const nodes: WorkflowGraphNode[] = [...referenced].map((id) => {
    const raw = nodeById.get(id);
    const nodeType = (raw && str(raw, 'nodeType')) ?? '';
    const metadata = asRecord(raw?.['metadata']);
    const displayName = (metadata && str(metadata, 'displayName')) ?? id;
    // The entry node always reads as "start"; a node nothing flows out of (a terminal report,
    // a final branch) reads as "end" — both override the type-derived kind, which only matters
    // for everything in between.
    const kind: WorkflowNodeKind = id === entryNodeId ? 'start' : !hasOutgoing.has(id) ? 'end' : kindFor(nodeType);
    return { id, displayName, nodeType, kind };
  });

  return { nodes, edges, entryNodeId };
}
