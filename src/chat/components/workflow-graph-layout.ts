import type { WorkflowGraphStructure } from '../../client/domain/workflow-graph-models.js';

export interface Point {
  x: number;
  y: number;
}

export interface WorkflowLayout {
  positions: Map<string, Point>;
  width: number;
  height: number;
  /** `"from->to"` keys of edges that loop back to an earlier layer (a retry loop) — drawn as a
   * dashed arc instead of the usual left-to-right curve. */
  backEdges: Set<string>;
}

const COL_GAP = 132;
const ROW_GAP = 92;
const MARGIN = 56;
// A graph smaller than this is centered in it, so a lone node is drawn at its normal size instead of being zoomed to fill the view.
const MIN_WIDTH = 880;
const MIN_HEIGHT = 330;

export const edgeKey = (from: string, to: string): string => `${from}->${to}`;

/**
 * Lays a Workflow's graph out left-to-right, one column per "distance from the start" (a node's
 * layer = the longest path to it from the entry node, over the graph with cycles broken — see
 * below), rows within a column ordered by a breadth-first walk so a chain of nodes reads top to
 * bottom in the order it actually runs. This is a diagram, not the positions saved in the
 * workflow editor (`node.position`) — those place resource/wiring nodes this graph already
 * excludes and are laid out for free-form editing, not for a clean left-to-right read.
 *
 * Cycles (a retry loop back to an earlier node) are real in a workflow graph and must not hang
 * the layering pass: a DFS classifies each edge as a tree/forward/cross edge (kept) or a back
 * edge (a target already on the current DFS path) — back edges are excluded from layering and
 * reported separately in `backEdges` for the caller to draw differently.
 */
export function layoutWorkflowGraph(structure: WorkflowGraphStructure): WorkflowLayout {
  const ids = structure.nodes.map((n) => n.id);
  const idSet = new Set(ids);
  if (ids.length === 0) return { positions: new Map(), width: 0, height: 0, backEdges: new Set() };

  const adjacency = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of structure.edges) {
    if (idSet.has(e.from) && idSet.has(e.to)) adjacency.get(e.from)!.push(e.to);
  }

  // DFS cycle breaking: WHITE = unvisited, GRAY = on the current path, BLACK = done. An edge to a
  // GRAY node is a back edge (a loop) — excluded from the DAG the rest of this function lays out.
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map(ids.map((id) => [id, WHITE]));
  const backEdges = new Set<string>();
  const dag = new Map<string, string[]>(ids.map((id) => [id, []]));
  const dfs = (u: string) => {
    color.set(u, GRAY);
    for (const v of adjacency.get(u) ?? []) {
      const c = color.get(v);
      if (c === GRAY) backEdges.add(edgeKey(u, v));
      else {
        dag.get(u)!.push(v);
        if (c === WHITE) dfs(v);
      }
    }
    color.set(u, BLACK);
  };
  const incoming = new Set(structure.edges.filter((e) => idSet.has(e.to)).map((e) => e.to));
  const roots = structure.entryNodeId && idSet.has(structure.entryNodeId) ? [structure.entryNodeId] : ids.filter((id) => !incoming.has(id));
  for (const r of roots.length ? roots : ids) if (color.get(r) === WHITE) dfs(r);
  for (const id of ids) if (color.get(id) === WHITE) dfs(id); // any node unreached from a root (disconnected)

  // Layer = longest path from a root, via a topological pass over the (now acyclic) `dag`.
  const indegree = new Map(ids.map((id) => [id, 0]));
  for (const tos of dag.values()) for (const t of tos) indegree.set(t, (indegree.get(t) ?? 0) + 1);
  const layer = new Map(ids.map((id) => [id, 0]));
  const topoQueue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  while (topoQueue.length > 0) {
    const u = topoQueue.shift()!;
    for (const v of dag.get(u) ?? []) {
      layer.set(v, Math.max(layer.get(v) ?? 0, (layer.get(u) ?? 0) + 1));
      const left = (indegree.get(v) ?? 0) - 1;
      indegree.set(v, left);
      if (left === 0) topoQueue.push(v);
    }
  }

  // Row order within each layer: a breadth-first walk from the roots, so a straight chain of
  // nodes keeps reading top-to-bottom instead of an arbitrary/alphabetical order.
  const layers = new Map<number, string[]>();
  const placed = new Set<string>();
  const place = (id: string) => {
    if (placed.has(id)) return;
    placed.add(id);
    const l = layer.get(id) ?? 0;
    (layers.get(l) ?? layers.set(l, []).get(l)!).push(id);
  };
  const bfsQueue = [...(roots.length ? roots : ids)];
  const bfsSeen = new Set(bfsQueue);
  while (bfsQueue.length > 0) {
    const u = bfsQueue.shift()!;
    place(u);
    for (const v of dag.get(u) ?? []) {
      if (!bfsSeen.has(v)) {
        bfsSeen.add(v);
        bfsQueue.push(v);
      }
    }
  }
  for (const id of ids) place(id); // anything still unplaced (disconnected from every root)

  const maxRows = Math.max(1, ...[...layers.values()].map((l) => l.length));
  const maxLayer = Math.max(0, ...[...layers.keys()]);
  const naturalWidth = MARGIN * 2 + maxLayer * COL_GAP;
  const naturalHeight = MARGIN * 2 + (maxRows - 1) * ROW_GAP;
  const width = Math.max(naturalWidth, MIN_WIDTH);
  const height = Math.max(naturalHeight, MIN_HEIGHT);
  const offsetX = (width - naturalWidth) / 2;
  const offsetY = (height - naturalHeight) / 2;
  const positions = new Map<string, Point>();
  for (const [l, idsInLayer] of layers) {
    const total = idsInLayer.length;
    idsInLayer.forEach((id, i) => {
      positions.set(id, {
        x: offsetX + MARGIN + l * COL_GAP,
        y: offsetY + MARGIN + ((maxRows - total) / 2 + i) * ROW_GAP,
      });
    });
  }

  return { positions, width, height, backEdges };
}

/** A left-to-right S-curve between two node centers — the standard flowchart connector shape. */
export function flowCurve(a: Point, b: Point): string {
  const dx = Math.max(36, (b.x - a.x) / 2);
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} C ${(a.x + dx).toFixed(1)} ${a.y.toFixed(1)}, ${(b.x - dx).toFixed(1)} ${b.y.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/** A loop-back connector (a retry edge to an earlier column) — arcs below both nodes rather than crossing straight through the diagram. */
export function loopCurve(a: Point, b: Point): string {
  const dip = Math.max(a.y, b.y) + 54;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} C ${a.x.toFixed(1)} ${dip.toFixed(1)}, ${b.x.toFixed(1)} ${dip.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}
