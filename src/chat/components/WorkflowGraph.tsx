import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import type { ChatController, WorkflowStepStatus } from '../chat-controller.js';
import type { WorkflowGraphNode, WorkflowGraphStructure, WorkflowNodeKind } from '../../client/domain/workflow-graph-models.js';
import { edgeKey, flowCurve, layoutWorkflowGraph, loopCurve, type Point } from './workflow-graph-layout.js';
import { Icon } from '../../icons/Icon.js';
import { materialIcon } from '../../icons/icon-ref.js';

export interface WorkflowGraphProps {
  /**
   * The chat whose run the graph follows. Optional: without one the graph is a still picture of the workflow (draw it from
   * `statuses`, or leave it at rest) — what a catalog or a preview needs, where no run exists.
   */
  controller?: ChatController;
  /** The workflow's flow structure — from `client.entities.fetchWorkflowGraph(workflowId)`. */
  structure: WorkflowGraphStructure;
  /**
   * Status of each node, keyed by node id — from `useExecutionNodeStatuses(executionId)` (the execution's own
   * status API: right on a fresh run, after a reconnect and when reopening an old execution). When omitted the
   * graph falls back to what the controller has seen on the stream (`controller.stepStatuses`), which is empty
   * for anything that happened before this page was open.
   */
  statuses?: ReadonlyMap<string, WorkflowStepStatus>;
  /**
   * Where the camera looks. `follow` (the default) opens on the start node and glides to whichever node is running — right for
   * a live run. `fit` keeps the whole diagram in view and never moves by itself — right for a catalog, a preview or a
   * documentation page, where nobody runs the workflow (the visitor can still drag and zoom).
   *
   * In `follow` the frame is a viewer of its own: it takes the height its host gives it (`height: 100%` of a parent with a definite
   * height) and otherwise a 16:9 box (never under a readable minimum), and the drawing is clipped by that frame only — never by the
   * bounds of the diagram. In `fit` the frame has the ratio of the diagram, as before.
   */
  camera?: 'follow' | 'fit';
  /**
   * Whether the visitor can drag, zoom (wheel, pinch) and fit the diagram. Default true. Turn it off for a diagram on a page that scrolls
   * (a catalog, a documentation page): the wheel then scrolls the page instead of zooming the drawing.
   */
  interactive?: boolean;
  className?: string;
}

const NODE_RADIUS = 20;
const LABEL_MAX = 18;
const truncate = (text: string) => (text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text);

/** How much of the diagram (in its own layout units — see `workflow-graph-layout.ts`'s
 * COL_GAP) stays in view once the camera focuses a node: about one neighbor's worth on either
 * side, not the whole diagram. The *zoom level* that achieves that depends on how sprawling this
 * particular workflow's layout is — a fixed zoom looked fine on a small workflow and left nodes
 * tiny on a large one (confirmed: a 14-node, ~1400-unit-wide diagram at a flat 1.5× left its
 * focused node only ~13px across in a 320px-wide dock) — so it's computed from `layout.width`
 * below, not a constant. */
const FOCUS_SPAN = 360;

/** The zoom level that brings `FOCUS_SPAN` layout units into view, clamped to the same range manual zoom uses. */
function focusZoomFor(layout: { width: number }): number {
  return layout.width > 0 ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, layout.width / FOCUS_SPAN)) : 1;
}

/** The view that puts `point` in the middle of a diagram of `width` x `height` layout units at zoom `k`. */
function viewOn(point: Point, k: number, width: number, height: number): View {
  return { k, x: width / 2 - point.x * k, y: height / 2 - point.y * k };
}

/** One glyph + CSS color-role per node kind — see `--ag-workflow-*` tokens in `styles.css` for how to retheme. */
const KIND_ICON: Record<WorkflowNodeKind, string> = {
  start: 'E037', // play_arrow
  decision: 'E254', // call_split
  human: 'E0B7', // chat
  ai: 'E322', // memory
  end: 'E5CA', // check
  action: 'E8B8', // settings
};

/** The node the camera should be looking at: whichever is currently working (or, failing that,
 * waiting on the user) — or, once it's done and nothing new has started yet, wherever that last
 * one was, so the view holds steady between two steps instead of snapping back to the start.
 * Before anything has run at all, that's the entry node. */
function useActiveNodeId(structure: WorkflowGraphStructure, statuses: ReadonlyMap<string, WorkflowStepStatus>): string | undefined {
  const lastActiveRef = useRef<string | undefined>(undefined);
  return useMemo(() => {
    const working = structure.nodes.find((n) => statuses.get(n.id) === 'working');
    const waiting = !working ? structure.nodes.find((n) => statuses.get(n.id) === 'waiting') : undefined;
    const found = working?.id ?? waiting?.id;
    if (found) lastActiveRef.current = found;
    return found ?? lastActiveRef.current ?? structure.entryNodeId ?? structure.nodes[0]?.id;
  }, [structure, statuses]);
}

const noSubscribe = () => () => {};
const NO_STEP_STATUSES: ReadonlyMap<string, WorkflowStepStatus> = new Map();

/**
 * A Workflow's node graph as a flow diagram — same live-status idea as `TeamGraph` (driven by
 * `ChatController`, lights up as the run reaches each node) but for a Workflow's actual node
 * graph instead of a Team's member constellation: circles left-to-right, one per node, linked by
 * the workflow's real execution-flow edges (a decision node's branches carry their condition's
 * label, same as the workflow editor). The camera opens centered on the start node and glides to
 * follow whichever node is currently running — dragging or zooming by hand takes over until the
 * "Recenter" button hands control back. Optional and independent of `ChatDiscussion`. Structural
 * markup with `ag-workflow-graph*` classes (default look in `styles.css`).
 */
export function WorkflowGraph({ controller, structure, statuses: statusesProp, camera = 'follow', interactive = true, className }: WorkflowGraphProps) {
  const streamStatuses = useSyncExternalStore(controller?.subscribe ?? noSubscribe, () => controller?.stepStatuses ?? NO_STEP_STATUSES);
  const statuses = statusesProp ?? streamStatuses;
  const fit = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => layoutWorkflowGraph(structure), [structure]);
  const svgRef = useRef<SVGSVGElement>(null);
  const followRef = useRef(true);
  // In `follow` the first image is already the one on the start node (no flash of the whole diagram, no glide at opening).
  const startId = structure.entryNodeId ?? structure.nodes[0]?.id;
  const startAt = startId ? layout.positions.get(startId) : undefined;
  const initialView = camera === 'follow' && startAt ? viewOn(startAt, focusZoomFor(layout), layout.width, layout.height) : undefined;
  const { view, smooth, focusOn, recenter } = usePanZoom(
    svgRef,
    layout.width,
    layout.height,
    () => {
      followRef.current = false;
    },
    interactive,
    initialView,
  );

  const activeNodeId = useActiveNodeId(structure, statuses);
  const seenActiveRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (camera === 'fit' || !followRef.current || !activeNodeId || activeNodeId === seenActiveRef.current) return;
    const first = seenActiveRef.current === undefined;
    seenActiveRef.current = activeNodeId;
    const at = layout.positions.get(activeNodeId);
    // The opening is not animated: it is the picture the visitor sees first, and the one a still image keeps.
    if (at) focusOn(at, focusZoomFor(layout), !first);
  }, [activeNodeId, layout, focusOn, camera]);

  const statusOf = (id: string): WorkflowStepStatus | 'idle' => statuses.get(id) ?? 'idle';

  const node = (n: WorkflowGraphNode, at: Point) => {
    const status = statusOf(n.id);
    return (
      <g key={n.id} transform={`translate(${at.x} ${at.y})`}>
        {/* Solid backing: the node dims as a whole once a run starts, but the links running under it must never show through. */}
        <circle className="ag-workflow-graph__backing" r={NODE_RADIUS} />
        <g className="ag-workflow-graph__node" data-kind={n.kind} data-status={status}>
          <title>{`${n.displayName} — ${statusText(status)}`}</title>
          <circle className="ag-workflow-graph__circle" r={NODE_RADIUS} />
          <Icon icon={materialIcon(KIND_ICON[n.kind])} x={-NODE_RADIUS * 0.55} y={-NODE_RADIUS * 0.55} size={NODE_RADIUS * 1.1} className="ag-workflow-graph__glyph" />
          <circle className="ag-workflow-graph__ring" r={NODE_RADIUS + 3.5} fill="none" />
          <text className="ag-workflow-graph__label" y={NODE_RADIUS + 14} textAnchor="middle">
            {truncate(n.displayName)}
          </text>
        </g>
      </g>
    );
  };

  return (
    <div
      ref={fit}
      className="ag-workflow-graph-fit"
      data-camera={camera}
      style={camera === 'fit' ? { aspectRatio: `${Math.max(layout.width, 1).toFixed(0)} / ${Math.max(layout.height, 1).toFixed(0)}` } : undefined}
    >
      <svg
        ref={svgRef}
        className={cx('ag-workflow-graph', className)}
        data-interactive={interactive ? undefined : 'false'}
        data-run={statuses.size > 0 ? 'active' : 'none'}
        viewBox={`0 0 ${Math.max(layout.width, 1).toFixed(1)} ${Math.max(layout.height, 1).toFixed(1)}`}
        role="img"
        aria-label="Workflow"
      >
        <g
          className="ag-workflow-graph__viewport"
          style={{ transform: `translate(${view.x.toFixed(2)}px, ${view.y.toFixed(2)}px) scale(${view.k.toFixed(4)})`, transition: smooth ? 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)' : 'none' }}
        >
          {structure.edges.map((e) => {
            const a = layout.positions.get(e.from);
            const b = layout.positions.get(e.to);
            if (!a || !b) return null;
            const isBack = layout.backEdges.has(edgeKey(e.from, e.to));
            const status = statusOf(e.from) === 'done' || statusOf(e.from) === 'waiting' ? statusOf(e.to) : statusOf(e.from) === 'working' ? 'working' : 'idle';
            const from = { x: a.x + NODE_RADIUS, y: a.y };
            const to = { x: b.x - NODE_RADIUS, y: b.y };
            return (
              <g key={`${e.from}-${e.to}`} className="ag-workflow-graph__link">
                <path className={cx('ag-workflow-graph__edge', isBack && 'ag-workflow-graph__edge--loop')} data-status={status} d={isBack ? loopCurve(a, b) : flowCurve(from, to)} />
                {e.label && <EdgeLabel a={from} b={to} text={e.label} loop={isBack} />}
              </g>
            );
          })}
          {structure.nodes.map((n) => {
            const at = layout.positions.get(n.id);
            return at ? node(n, at) : null;
          })}
        </g>
      </svg>
      {interactive && (
        <button
          type="button"
          className="ag-workflow-graph__fit"
          onClick={() => {
            followRef.current = true;
            const at = activeNodeId ? layout.positions.get(activeNodeId) : undefined;
            if (at) focusOn(at, focusZoomFor(layout));
            else recenter();
          }}
          title="Recenter on the active step"
          aria-label="Recenter on the active step"
        >
          <Icon icon={materialIcon('E28C')} />
        </button>
      )}
    </div>
  );
}

function statusText(status: WorkflowStepStatus | 'idle'): string {
  switch (status) {
    case 'working':
      return 'in progress';
    case 'waiting':
      return 'waiting on you';
    case 'done':
      return 'done';
    case 'failed':
      return 'failed';
    default:
      return 'not reached yet';
  }
}

/** A branch condition's label (e.g. "Yes"/"No"), set at the curve's midpoint clear of the link itself. */
function EdgeLabel({ a, b, text, loop }: { a: Point; b: Point; text: string; loop: boolean }) {
  const mx = (a.x + b.x) / 2;
  const my = loop ? Math.max(a.y, b.y) + 54 : (a.y + b.y) / 2;
  const width = text.length * 6.2 + 14;
  return (
    <g className="ag-workflow-graph__edge-label" transform={`translate(${mx.toFixed(1)} ${my.toFixed(1)})`}>
      <rect x={-width / 2} y={-9} width={width} height={18} rx={9} />
      <text y={4} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

interface View {
  k: number;
  x: number;
  y: number;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 6;

const zoomAt = (view: View, at: Point, factor: number): View => {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * factor));
  const ratio = k / view.k;
  return { k, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio };
};

interface PanZoom {
  view: View;
  /** True for the duration of a programmatic `focusOn`/`recenter` jump — gates the CSS
   * transition so a hand drag/pinch stays instant while an auto-follow glide stays smooth. */
  smooth: boolean;
  /** Centers `point` in the viewport at zoom `k` (default: the current zoom), animated. */
  focusOn: (point: Point, k?: number, animate?: boolean) => void;
  /** Back to showing the whole diagram at 1×, animated. */
  recenter: () => void;
}

/** Pan and zoom of the graph — drag (mouse or one finger) to move, wheel or pinch to zoom around
 * the pointer/fingers; both cancel the current auto-follow (via `onUserInteract`) and render
 * instantly. `focusOn`/`recenter` instead animate — see `smooth`. */
function usePanZoom(svgRef: RefObject<SVGSVGElement | null>, width: number, height: number, onUserInteract: () => void, enabled: boolean, initial?: View): PanZoom {
  const FITTED: View = { k: 1, x: 0, y: 0 };
  const [view, setView] = useState<View>(initial ?? FITTED);
  const [smooth, setSmooth] = useState(false);

  // A ref, not a dependency: `onUserInteract` is typically a fresh closure every render (as it
  // is here — WorkflowGraph passes an inline arrow function). Depending on it directly would
  // re-run the effect below — and so re-create `pointers`/`pinch` and re-attach every listener —
  // on every single setView call, which fires mid-drag on every pointermove. That tore the drag
  // apart: each move re-subscribed with a blank `pointers` Map, so the very next move saw no
  // "before" position and did nothing, which is exactly the "can't drag it anymore" symptom.
  const onUserInteractRef = useRef(onUserInteract);
  onUserInteractRef.current = onUserInteract;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !enabled) return;
    const pointers = new Map<number, Point>();
    let pinch: { dist: number; mid: Point } | null = null;

    const scale = () => {
      const r = svg.getBoundingClientRect();
      return { r, s: Math.max(width / (r.width || 1), height / (r.height || 1)) };
    };
    const local = (x: number, y: number): Point => {
      const { r, s } = scale();
      return { x: (x - r.left) * s, y: (y - r.top) * s };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setSmooth(false);
      onUserInteractRef.current();
      const at = local(e.clientX, e.clientY);
      setView((v) => zoomAt(v, at, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    };
    const onDown = (e: PointerEvent) => {
      setSmooth(false);
      onUserInteractRef.current();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svg.setPointerCapture?.(e.pointerId);
      pinch = null;
    };
    const onMove = (e: PointerEvent) => {
      const before = pointers.get(e.pointerId);
      if (!before) return;
      const now = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, now);
      const { s } = scale();
      if (pointers.size === 1) {
        setView((v) => ({ ...v, x: v.x + (now.x - before.x) * s, y: v.y + (now.y - before.y) * s }));
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [Point, Point];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (pinch) {
          const prev = pinch;
          const at = local(mid.x, mid.y);
          setView((v) => {
            const zoomed = zoomAt(v, at, dist / prev.dist);
            return { ...zoomed, x: zoomed.x + (mid.x - prev.mid.x) * s, y: zoomed.y + (mid.y - prev.mid.y) * s };
          });
        }
        pinch = { dist, mid };
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = null;
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
    };
  }, [svgRef, width, height, enabled]);

  const focusOn = useCallback(
    (point: Point, k?: number, animate = true) => {
      setSmooth(animate);
      setView((v) => viewOn(point, k ?? v.k, width, height));
    },
    [width, height]
  );

  const recenter = useCallback(() => {
    setSmooth(true);
    setView(FITTED);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { view, smooth, focusOn, recenter };
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
