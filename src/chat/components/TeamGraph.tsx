import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import type { ChatController, TeamMemberStatus } from '../chat-controller.js';
import { resolveMemberAvatar as resolveAvatar, type AgUiChatMember, type AgUiMemberAvatar } from './member-avatar.js';
import { Icon } from '../../icons/Icon.js';
import { materialIcon } from '../../icons/icon-ref.js';
import { groupColorOverrides, orderByGroup, teamGroupColors, teamGroupKey } from './team-groups.js';
import { memberAvatarFor, teamMemberShortName, teamMemberStatusText, type AgUiTeamMember, type AgUiTeamTopology } from './team-member.js';
import { groupsFor, pillWidth, sceneFor, shorten, type SceneEdge, type SceneGroup, type TeamScene } from './team-layouts.js';

export interface TeamGraphProps {
  controller: ChatController;
  /** Every member of the Team. */
  members: AgUiTeamMember[];
  /** The coordinating member (a manager), drawn in the middle and linked to every group. Omit to draw the groups around a neutral center. */
  hubMemberId?: string;
  /**
   * How the team is organized, so each kind is drawn the way it works: a hub for a manager-led team, a numbered chain for a
   * sequential one, parallel lanes for a concurrent one, a ring of linked peers for a handoff, a shared table for a group chat.
   * Omit it and the graph reads it from the members (`teamMembersFromStructure` sets it), falling back to the hub-and-groups
   * constellation.
   */
  topology?: AgUiTeamTopology;
  /** Maps a member's identity to an avatar (image/emoji/color). Falls back to initials+color when omitted. */
  resolveMemberAvatar?: (member: AgUiChatMember) => AgUiMemberAvatar | undefined;
  /** Show the members in their group colors while nothing is running (a still picture of the team). By default they are switched off and light up as the run needs them. */
  restingColors?: boolean;
  /**
   * Status of each member, keyed by `memberEntityId` — from `useExecutionStatuses(executionId).members` (the execution's own
   * inspector: right on a fresh run, after a reconnect and when reopening an old execution). When omitted it falls back to
   * what the controller has seen on the stream (`controller.memberStatuses`), which is empty for anything that happened
   * before this page was open.
   */
  statuses?: ReadonlyMap<string, TeamMemberStatus>;
  className?: string;
}

/** The size the graph is designed at; a bigger or differently shaped box scales it up and spreads the ring to fill it. */
const DESIGN = { width: 400, height: 380 };
const MAX_SPAN = 1200;
/** Where a group's junction sits, as a fraction of the ring. */
const JUNCTION = 0.6;
const NODE_RADIUS = 13;
const HUB_RADIUS = 21;
const LABEL_MAX = 16;

const truncate = (text: string) => (text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text);

/** Vertices of a hexagon with a vertex at the top and bottom (the shape Team Studio draws), circumradius `r`. */
const hexPoints = (r: number) =>
  [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const angle = (Math.PI / 180) * (60 * i - 90);
      return `${(r * Math.cos(angle)).toFixed(1)},${(r * Math.sin(angle)).toFixed(1)}`;
    })
    .join(' ');

interface Point {
  x: number;
  y: number;
}
interface Placed {
  member: AgUiTeamMember;
  at: Point;
  /** The curve from the group's junction (or from the hub, for a member without a group). */
  from: Point;
  bend: number;
}
interface Branch {
  key?: string;
  /** The group's name as written by the team editor. */
  name?: string;
  junction?: Point;
  /** Direction of the junction from the center, in radians. */
  angle: number;
  members: Placed[];
}

/** The drawing space of the graph: its size in SVG units, its center and the radii of the ring the members sit on. */
interface Frame {
  width: number;
  height: number;
  center: Point;
  ring: Point;
}

const frameOf = (width: number, height: number): Frame => ({
  width,
  height,
  center: { x: width / 2, y: height / 2 },
  // The ring follows the box, but never stretches past 1.4 : 1 — a tall, narrow box gets a centered constellation, not a thread.
  ring: (() => {
    const x = Math.max(width / 2 - 48, 100);
    return { x, y: Math.min(Math.max(height / 2 - 58, 85), x * 1.4) };
  })(),
});

const DEFAULT_FRAME = frameOf(DESIGN.width, DESIGN.height);

/** A box taller than this many times its width is a side panel: the graph is scaled to its width rather than shrunk to fit its height. */
const TALL_BOX = 1.4;
/** The width, in design units, a tall narrow box is laid out in — three captions side by side, one design unit per pixel. */
const NARROW_WIDTH = 280;

/**
 * The frame that fills a box of `w` × `h` pixels: elements keep the size they have at the design size (scaled by the
 * tighter of the two dimensions) and the ring stretches to the rest of the space. A tall, narrow box (a side panel) would
 * make everything tiny that way, so there the scale follows the width — down to `NARROW_WIDTH` units across — and the
 * extra height is left to the layout.
 */
function frameFor(box: { w: number; h: number } | null): Frame {
  if (!box || box.w < 40 || box.h < 40) return DEFAULT_FRAME;
  const fitted = Math.min(box.w / DESIGN.width, box.h / DESIGN.height);
  const scale = box.h > box.w * TALL_BOX ? Math.max(fitted, Math.min(1, box.w / NARROW_WIDTH)) : fitted;
  return frameOf(Math.min(box.w / scale, MAX_SPAN), Math.min(box.h / scale, MAX_SPAN));
}

const onRing = (frame: Frame, angle: number, scale = 1): Point => ({
  x: frame.center.x + frame.ring.x * scale * Math.cos(angle),
  y: frame.center.y + frame.ring.y * scale * Math.sin(angle),
});

/** A curve from `a` to `b`, bent sideways by `bend` × its length — every link of the graph is one. */
function curve(a: Point, b: Point, bend: number): string {
  const { d } = curveParts(a, b, bend);
  return d;
}

function curveParts(a: Point, b: Point, bend: number): { d: string; control: Point } {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const control = { x: mx - (b.y - a.y) * bend, y: my + (b.x - a.x) * bend };
  return { d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${control.x.toFixed(1)} ${control.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`, control };
}

const HEAD_SIZE = 6.5;

/** A small triangle at `tip`, pointing the way the curve arrives there (from its control point). */
function arrowHead(tip: Point, control: Point): string {
  const dx = tip.x - control.x;
  const dy = tip.y - control.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const bx = tip.x - ux * HEAD_SIZE;
  const by = tip.y - uy * HEAD_SIZE;
  const wx = -uy * HEAD_SIZE * 0.55;
  const wy = ux * HEAD_SIZE * 0.55;
  return `M${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L${(bx + wx).toFixed(1)} ${(by + wy).toFixed(1)} L${(bx - wx).toFixed(1)} ${(by - wy).toFixed(1)} Z`;
}

/**
 * Lays the members out as a constellation: each group gets an angular sector of the ring in proportion to its size, a
 * junction dot on the way to it, and its members spread across the sector. A member without a group is its own sector,
 * linked straight to the hub.
 */
function layout(others: AgUiTeamMember[], frame: Frame): Branch[] {
  const units: AgUiTeamMember[][] = [];
  for (const member of others) {
    const key = teamGroupKey(member.group);
    const last = units[units.length - 1];
    if (key && last && teamGroupKey(last[0]!.group) === key) last.push(member);
    else units.push([member]);
  }
  const total = Math.max(others.length, 1);
  let cursor = -Math.PI / 2;
  return units.map((unit) => {
    const grouped = !!teamGroupKey(unit[0]!.group);
    const sector = (2 * Math.PI * unit.length) / total;
    const middle = cursor + sector / 2;
    const junction = grouped ? onRing(frame, middle, JUNCTION) : undefined;
    const members = unit.map((member, i) => {
      const angle = cursor + (sector * (i + 0.5)) / unit.length;
      const flare = unit.length > 1 ? (angle - middle) / sector : 0;
      // A crowded group staggers its members on two rings, so their names never touch.
      const scale = unit.length > 3 && i % 2 === 1 ? 0.82 : 1;
      return { member, at: onRing(frame, angle, scale), from: junction ?? frame.center, bend: junction ? -flare * 0.9 : 0.12 };
    });
    cursor += sector;
    return { key: grouped ? teamGroupKey(unit[0]!.group) : undefined, name: grouped ? unit[0]!.group?.trim() : undefined, junction, angle: middle, members };
  });
}

/**
 * The whole Team as a constellation: an optional hub in the middle, one branch per group (named, in its color) and every
 * member a small hexagon with its icon and its name underneath. Each member is lit by its live status — working now
 * (animated link), waiting on the user, done (the path already taken is drawn in full), or not needed yet (a faint dotted
 * link). Driven by {@link ChatController.memberStatuses}; optional and independent of `ChatDiscussion`. Structural markup
 * with `ag-team-graph*` classes (default look in `styles.css`).
 */
export function TeamGraph({ controller, members, hubMemberId, topology: topologyProp, resolveMemberAvatar, restingColors, statuses: statusesProp, className }: TeamGraphProps) {
  const streamStatuses = useSyncExternalStore(controller.subscribe, () => controller.memberStatuses);
  const statuses = statusesProp ?? streamStatuses;
  // The graph fills the box it is given: it measures it and lays the ring out to fit.
  const fit = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = fit.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setBox((prev) => (prev && Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1 ? prev : { w: width, h: height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const frame = useMemo(() => frameFor(box), [box]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, fitView] = usePanZoom(svgRef);

  const groupColors = useMemo(() => teamGroupColors(members.map((m) => m.group), groupColorOverrides(members)), [members]);

  const { hub, branches } = useMemo(() => {
    const hubMember = hubMemberId ? members.find((m) => m.memberEntityId === hubMemberId) : undefined;
    const others = orderByGroup(
      members.filter((m) => m !== hubMember),
      (m) => m.group,
    );
    return { hub: hubMember, branches: layout(others, frame) };
  }, [members, hubMemberId, frame]);

  const colorOf = (member: AgUiTeamMember) => groupColors.get(teamGroupKey(member.group) ?? '');

  // Every topology but the manager-led one has its own layout; the manager-led one (and a team of unknown shape) keeps the constellation.
  const topology = topologyProp ?? members.find((m) => m.topology)?.topology;
  const memberById = useMemo(() => new Map(members.map((m) => [m.memberEntityId, m])), [members]);
  const scene = useMemo<TeamScene | undefined>(() => {
    if (!topology || topology.kind === 'manager-led') return undefined;
    // A chain keeps the order of the team; every other layout draws a group as one arc / one block, so its members sit together.
    const ordered = topology.kind === 'sequential' ? members : orderByGroup(members, (m) => m.group);
    return sceneFor(topology.kind, ordered.map((m) => m.memberEntityId), topology.links, frame, (id) => teamGroupKey(members.find((m) => m.memberEntityId === id)?.group));
  }, [members, topology, frame]);
  // In a chain the order is the team's, so a group split by another is drawn once per run of consecutive members (key `group#run`).
  const chainRuns = useMemo(() => {
    const runs = new Map<string, string>();
    if (topology?.kind !== 'sequential') return runs;
    let previous: string | undefined;
    let run = 0;
    for (const m of members) {
      const key = teamGroupKey(m.group);
      if (key !== previous) run++;
      previous = key;
      if (key) runs.set(m.memberEntityId, `${key}#${run}`);
    }
    return runs;
  }, [members, topology]);
  const sceneGroups = useMemo<SceneGroup[]>(
    () =>
      scene
        ? groupsFor(
            scene,
            (id) => {
              const member = memberById.get(id);
              const key = teamGroupKey(member?.group);
              return key ? { key: chainRuns.get(id) ?? key, name: member!.group!.trim() } : undefined;
            },
            frame,
          )
        : [],
    [scene, memberById, chainRuns, frame],
  );

  const node = (member: AgUiTeamMember, at: Point, radius: number, order?: number, labelAbove?: boolean) => {
    const status = statuses.get(member.memberEntityId);
    const avatar = resolveAvatar(member, memberAvatarFor(member, colorOf(member), resolveMemberAvatar));
    // A member wears its group's color (or the app's own) on the hexagon's border and on its icon.
    const accent = avatar.color;
    const hexRadius = radius * 1.15;
    const glyphSize = radius * 1.05;
    const colorStyle = accent ? { color: accent } : undefined;
    const glyphText = (value: string | undefined) => (
      <text className="ag-team-graph__glyph" textAnchor="middle" dominantBaseline="central" fontSize={radius * 0.8} style={colorStyle}>
        {value}
      </text>
    );
    const initials = glyphText(avatar.initials);
    const clipId = `ag-team-clip-${member.memberEntityId}`;
    return (
      <g key={member.memberEntityId} transform={`translate(${at.x} ${at.y})`}>
        {/* Solid backing: the node dims as a whole once a run starts, but the links running under it must never show through. */}
        <polygon className="ag-team-graph__backing" points={hexPoints(hexRadius)} />
        <g className="ag-team-graph__node" data-status={status ?? 'idle'}>
        <title>{`${member.displayName} — ${teamMemberStatusText(status)}`}</title>
        {avatar.imageUrl ? (
          <>
            <clipPath id={clipId}>
              <polygon points={hexPoints(hexRadius)} />
            </clipPath>
            <image href={avatar.imageUrl} x={-hexRadius} y={-hexRadius} width={hexRadius * 2} height={hexRadius * 2} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
            <polygon className="ag-team-graph__hex ag-team-graph__hex--outline" points={hexPoints(hexRadius)} style={accent ? { stroke: accent } : undefined} />
          </>
        ) : (
          <>
            <polygon className="ag-team-graph__hex" points={hexPoints(hexRadius)} style={accent ? { stroke: accent } : undefined} />
            {!avatar.emoji && avatar.icon ? (
              <Icon icon={avatar.icon} x={-glyphSize / 2} y={-glyphSize / 2} size={glyphSize} className="ag-team-graph__glyph" style={colorStyle} fallback={initials} />
            ) : (
              <>{avatar.emoji ? glyphText(avatar.emoji) : initials}</>
            )}
          </>
        )}
        <polygon className="ag-team-graph__ring" points={hexPoints(hexRadius + 3.5)} fill="none" />
        {order !== undefined && (
          <g className="ag-team-graph__order" transform={`translate(${(-hexRadius * 0.9).toFixed(1)} ${(-hexRadius * 0.95).toFixed(1)})`} style={colorStyle}>
            <circle r={6.2} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={7.5}>
              {order}
            </text>
          </g>
        )}
        <text className="ag-team-graph__label" y={labelAbove ? -(hexRadius + 6) : hexRadius + 12} textAnchor="middle">
          {truncate(member.label ?? teamMemberShortName(member.displayName))}
        </text>
        </g>
      </g>
    );
  };

  // A branch is lit as soon as one of its members is in the run.
  const litStatus = (branch: Branch) => {
    const all = branch.members.map((p) => statuses.get(p.member.memberEntityId));
    return all.includes('working') ? 'working' : all.includes('waiting') ? 'waiting' : all.includes('done') ? 'done' : 'idle';
  };

  const anyStatus = (...ids: string[]) => {
    const all = ids.map((id) => statuses.get(id));
    return all.includes('working') ? 'working' : all.includes('waiting') ? 'waiting' : all.includes('done') ? 'done' : 'idle';
  };

  const sceneEdge = (e: SceneEdge) => {
    const a = shorten(e.from, e.to, e.fromInset);
    const b = shorten(e.to, e.from, e.toInset);
    const { d, control } = curveParts(a, b, e.bend);
    const everyone = members.map((m) => m.memberEntityId);
    // A link that stands for the whole team: lit once anyone is in the run (`any`), or once everyone is done (`all`).
    const status = e.lit === 'any' ? (anyStatus(...everyone) === 'idle' ? 'idle' : 'done') : e.lit === 'all' ? (everyone.length > 0 && everyone.every((id) => statuses.get(id) === 'done') ? 'done' : 'idle') : (statuses.get(e.lit) ?? 'idle');
    const lit = memberById.get(e.lit);
    const color = lit ? colorOf(lit) : e.lit === 'any' || e.lit === 'all' ? 'var(--ag-team-done, #10b981)' : undefined;
    return (
      <g key={e.key} className="ag-team-graph__link" style={color ? { color } : undefined}>
        <path className="ag-team-graph__edge" data-status={status} d={d} />
        {e.arrow && <path className="ag-team-graph__head" data-status={status} d={arrowHead(b, control)} />}
      </g>
    );
  };

  // Every group is drawn as in the constellation: a soft zone behind its members, in the group's color, and a badge with its name.
  const groupZones = sceneGroups.map((group) => (
    <g key={`zone-${group.key}`} style={{ color: groupColors.get(baseKey(group.key)) }}>
      <GroupZone points={group.points} />
    </g>
  ));
  const groupBadges = sceneGroups.map((group) => (
    <g key={`badge-${group.key}`} style={{ color: groupColors.get(baseKey(group.key)) }}>
      <GroupPill name={group.name} count={group.ids.length} center={group.label} />
    </g>
  ));

  const sceneBody = (current: TeamScene) => (
    <>
      {groupZones}
      {current.band && <rect className="ag-team-graph__band" x={current.band.x} y={current.band.y} width={current.band.width} height={current.band.height} rx={18} />}
      {current.edges.map(sceneEdge)}
      {groupBadges}
      {current.dots.map((dot) => {
        const status = dot.key === 'center' ? anyStatus(...members.map((m) => m.memberEntityId)) : dot.key === 'start' ? (statuses.size > 0 ? 'done' : 'idle') : anyStatus(...members.map((m) => m.memberEntityId)) === 'done' && members.every((m) => statuses.get(m.memberEntityId) === 'done') ? 'done' : 'idle';
        return dot.key === 'center' ? (
          <g key={dot.key} className="ag-team-graph__center" data-status={status} transform={`translate(${dot.at.x.toFixed(1)} ${dot.at.y.toFixed(1)})`}>
            <title>Shared conversation</title>
            <circle className="ag-team-graph__center-bubble" r={11} />
            <circle className="ag-team-graph__center-dot" cx={-4.5} r={1.5} />
            <circle className="ag-team-graph__center-dot" r={1.5} />
            <circle className="ag-team-graph__center-dot" cx={4.5} r={1.5} />
          </g>
        ) : (
          <circle key={dot.key} className="ag-team-graph__dot" data-status={status} cx={dot.at.x} cy={dot.at.y} r={dot.key === 'start' ? 4.5 : 5.5}>
            <title>{dot.key === 'start' ? 'Start' : 'All done'}</title>
          </circle>
        );
      })}
      {current.members.map((placed) => {
        const member = memberById.get(placed.id);
        return member ? node(member, placed.at, NODE_RADIUS, placed.order, placed.labelAbove) : null;
      })}
    </>
  );

  return (
    <div ref={fit} className="ag-team-graph-fit">
    <svg ref={svgRef} className={cx('ag-team-graph', className)} data-topology={scene ? topology?.kind : 'constellation'} data-run={statuses.size > 0 ? 'active' : 'none'} data-resting={restingColors ? 'true' : undefined} viewBox={`0 0 ${frame.width.toFixed(1)} ${frame.height.toFixed(1)}`} role="img" aria-label="Team">
      <g className="ag-team-graph__viewport" transform={`translate(${view.x.toFixed(2)} ${view.y.toFixed(2)}) scale(${view.k.toFixed(4)})`}>
      {scene ? sceneBody(scene) : <>
      {branches.map((branch, b) => {
        const color = branch.key ? groupColors.get(branch.key) : undefined;
        return (
          <g key={`branch-${b}`} className="ag-team-graph__branch" style={color ? { color } : undefined}>
            {branch.key && <GroupZone points={branch.members.map((p) => p.at)} />}
            {hub && branch.junction && <path className="ag-team-graph__edge ag-team-graph__edge--trunk" data-status={litStatus(branch)} d={curve(frame.center, branch.junction, 0.14)} />}
            {(hub || branch.junction) &&
              branch.members.map(({ member, at, from, bend }) => (
              <path key={`edge-${member.memberEntityId}`} className="ag-team-graph__edge" data-status={statuses.get(member.memberEntityId) ?? 'idle'} d={curve(from, at, bend)} />
              ))}
            {branch.junction && <circle className="ag-team-graph__junction" data-status={litStatus(branch)} cx={branch.junction.x} cy={branch.junction.y} r={2.6} />}
            {branch.junction && branch.name && <GroupLabel branch={branch} />}
          </g>
        );
      })}
      {branches.flatMap((branch) => branch.members.map(({ member, at }) => node(member, at, NODE_RADIUS)))}
      {hub && node(hub, frame.center, HUB_RADIUS)}
      </>}
      </g>
    </svg>
    <button type="button" className="ag-team-graph__fit" onClick={fitView} title="Fit to view" aria-label="Fit to view">
      <Icon icon={materialIcon('E28C')} />
    </button>
    </div>
  );
}

interface View {
  /** Zoom, 1 = fitted. */
  k: number;
  /** Pan, in SVG units. */
  x: number;
  y: number;
}

const FITTED: View = { k: 1, x: 0, y: 0 };
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;

const zoomAt = (view: View, at: Point, factor: number): View => {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * factor));
  const ratio = k / view.k;
  return { k, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio };
};

/**
 * Pan and zoom of the graph: drag (mouse or one finger) to move, wheel or pinch to zoom around the pointer/fingers.
 * Returns the current view and a way back to the fitted one.
 */
function usePanZoom(svgRef: RefObject<SVGSVGElement | null>): [View, () => void] {
  const [view, setView] = useState<View>(FITTED);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const pointers = new Map<number, Point>();
    let pinch: { dist: number; mid: Point } | null = null;

    // Pixels → SVG units, and a pixel position → a point of the SVG's own space.
    const scale = () => {
      const r = svg.getBoundingClientRect();
      const [, , w = DESIGN.width, h = DESIGN.height] = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
      return { r, s: Math.max(w / (r.width || 1), h / (r.height || 1)) };
    };
    const local = (x: number, y: number): Point => {
      const { r, s } = scale();
      return { x: (x - r.left) * s, y: (y - r.top) * s };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const at = local(e.clientX, e.clientY);
      setView((v) => zoomAt(v, at, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    };
    const onDown = (e: PointerEvent) => {
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

    // The wheel handler must be non-passive to keep the page from scrolling while the graph zooms.
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
  }, [svgRef]);

  return [view, () => setView(FITTED)];
}

/** The soft zone behind a group's members: their positions, thickened into one rounded shape in the group's color. */
function GroupZone({ points }: { points: Point[] }) {
  const list = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const only = points[0]!;
  return (
    <g className="ag-team-graph__zone" aria-hidden="true">
      {points.length === 1 ? (
        <line x1={only.x} y1={only.y} x2={only.x + 0.01} y2={only.y} />
      ) : points.length === 2 ? (
        <polyline points={list} />
      ) : (
        <polygon points={list} />
      )}
    </g>
  );
}

/** The group's badge — a pill with its color, its name in capitals and its size — set beside its junction, clear of the links. */
function GroupLabel({ branch }: { branch: Branch }) {
  const j = branch.junction!;
  const width = pillWidth(branch.name!);
  const px = -Math.sin(branch.angle);
  const py = Math.cos(branch.angle);
  return <GroupPill name={branch.name!} count={branch.members.length} center={{ x: j.x + px * (width / 2 + 6), y: j.y + py * 13 }} />;
}

/** A group's name badge — a pill in the group's color: a dot, the name in capitals and the member count — centered on `center`. */
function GroupPill({ name, count, center }: { name: string; count: number; center: Point }) {
  const label = name.toUpperCase();
  const width = pillWidth(name);
  const height = 15;
  const left = center.x - width / 2;
  return (
    <g className="ag-team-graph__badge">
      <rect className="ag-team-graph__pill" x={left} y={center.y - height / 2} width={width} height={height} rx={height / 2} />
      <circle className="ag-team-graph__pill-dot" cx={left + 9} cy={center.y} r={2.4} />
      <text className="ag-team-graph__group" x={left + 16} y={center.y + 3}>
        {label}
      </text>
      <text className="ag-team-graph__count" x={left + width - 8} y={center.y + 3} textAnchor="end">
        {count}
      </text>
    </g>
  );
}

/** The group a chain key stands for: `group#run` → `group`. */
const baseKey = (key: string) => key.replace(/#\d+$/, '');

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
