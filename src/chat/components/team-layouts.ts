import type { AgUiTeamLink, AgUiTeamTopologyKind } from './team-member.js';

/**
 * Where each topology puts the members of a team in the graph — pure geometry, no drawing. A manager-led team keeps its
 * hub-and-groups constellation (see `TeamGraph`); the other four kinds are laid out here:
 *
 * - `sequential`: a chain that snakes row by row, each member linked to the next, numbered in order;
 * - `concurrent`: a start, parallel lanes (a band when there are many), a join;
 * - `handoff`: peers on a ring, linked by the directed links of the team definition, the first member being the entry;
 * - `group-chat`: peers on a ring around the shared conversation they all take part in.
 */

export interface Point {
  x: number;
  y: number;
}

/** The drawing space: size in SVG units and the center and radii of the ring members sit on (see `TeamGraph`'s frame). */
export interface SceneFrame {
  width: number;
  height: number;
  center: Point;
  ring: Point;
}

/** A member's place in the scene. `order` is its 1-based position in a chain; `labelAbove` puts its name above it, clear of links arriving from below. */
export interface ScenePlacement {
  id: string;
  at: Point;
  order?: number;
  labelAbove?: boolean;
}

/**
 * A link of the scene. `lit` is the member whose status lights it, or `'any'` / `'all'` for a link that stands for the whole
 * team (lit once any member is in the run / once every member is done); `arrow` puts a head at its end.
 */
export interface SceneEdge {
  key: string;
  from: Point;
  to: Point;
  /** How far the curve bends sideways, as a fraction of its length. */
  bend: number;
  lit: string | 'any' | 'all';
  arrow: boolean;
  /** How far the link stops short of each end, so it does not run under a member's hexagon or a dot. */
  fromInset: number;
  toInset: number;
}

/** A point of the scene that is not a member: where a run starts, where parallel work joins, the shared conversation. */
export interface SceneDot {
  key: 'start' | 'join' | 'center';
  at: Point;
}

/** The rounded band that holds many parallel members. */
export interface SceneBand {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TeamScene {
  members: ScenePlacement[];
  edges: SceneEdge[];
  dots: SceneDot[];
  band?: SceneBand;
}

/** The room a member takes up: its hexagon, between a link and the member. */
export const MEMBER_INSET = 20;
const DOT_INSET = 6;
/** The narrowest a member's cell may be before its caption would touch its neighbour's. */
const MIN_CELL_WIDTH = 78;
/** Above this many members, parallel work is drawn as one band rather than a lane each. */
const MAX_LANES = 6;
/** A frame narrower than this (in design units) is a side panel. */
const NARROW_FRAME = 360;
/** Captions are at most 16 characters (about 70 units): in a narrow frame a cell may be just wide enough for one. */
const NARROW_MIN_CELL_WIDTH = 72;
/** The most a row of a chain may be tall: rows farther apart than this read as unrelated. */
const MAX_ROW_HEIGHT = 118;

const onEllipse = (frame: SceneFrame, angle: number, scale = 1): Point => ({
  x: frame.center.x + frame.ring.x * scale * Math.cos(angle),
  y: frame.center.y + frame.ring.y * scale * Math.sin(angle),
});

interface Grid {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
}

/** The columns and rows that fit `n` members in a box without a caption touching its neighbour's, as close to the box's shape as possible. */
function gridFor(n: number, width: number, height: number, minCell = MIN_CELL_WIDTH, fillWidth = false): Grid {
  const maxCols = Math.max(1, Math.floor(width / minCell));
  // `fillWidth`: as many columns as the width holds, rather than the number that best matches the box's shape.
  let cols = n <= Math.min(4, maxCols) ? n : fillWidth ? Math.min(n, maxCols) : Math.max(1, Math.min(n, maxCols, Math.round(Math.sqrt(n * (width / Math.max(height, 1))))));
  const rows = Math.max(1, Math.ceil(n / cols));
  cols = Math.max(1, Math.ceil(n / rows));
  return { cols, rows, cellW: width / cols, cellH: height / rows };
}

/** Chain: members on a serpentine grid in the order given, each linked to the next (or by the links given). */
export function sequentialScene(ids: string[], links: AgUiTeamLink[], frame: SceneFrame): TeamScene {
  const n = ids.length;
  // A narrow frame (a side panel) gives up its margins and its caption room so the chain can use the whole width.
  const narrow = frame.width < NARROW_FRAME;
  const padX = narrow ? 22 : 46;
  const padY = 50;
  const usableW = Math.max(frame.width - 2 * padX, 1);
  const usableH = Math.max(frame.height - 2 * padY, 1);
  const grid = gridFor(n, usableW, usableH, narrow ? NARROW_MIN_CELL_WIDTH : MIN_CELL_WIDTH, narrow);
  const { cols, cellW } = grid;
  // A tall frame would spread the rows far apart: they keep a steady spacing and the chain is centered vertically.
  const cellH = Math.min(grid.cellH, MAX_ROW_HEIGHT);
  const top = (frame.height - grid.rows * cellH) / 2;

  const members: ScenePlacement[] = ids.map((id, i) => {
    const row = Math.floor(i / cols);
    const slot = i % cols;
    // Every other row runs the other way, so the end of one row sits right above the start of the next.
    const col = row % 2 === 0 ? slot : cols - 1 - slot;
    return { id, at: { x: padX + (col + 0.5) * cellW, y: top + (row + 0.5) * cellH }, order: i + 1 };
  });
  const at = new Map(members.map((m) => [m.id, m.at]));

  const pairs = links.length > 0 ? links.filter((l) => at.has(l.from) && at.has(l.to)) : ids.slice(1).map((id, i) => ({ from: ids[i]!, to: id }));
  const edges = pairs.map((l, i) => {
    const from = at.get(l.from)!;
    const to = at.get(l.to)!;
    return edge(`chain-${i}`, from, to, Math.abs(from.y - to.y) < 1 ? 0.1 : 0, l.to, true, MEMBER_INSET, MEMBER_INSET);
  });
  return { members, edges, dots: [] };
}

/** Parallel work: a start on the left, a lane per member (or one band holding them all when there are many), a join on the right. */
export function concurrentScene(ids: string[], frame: SceneFrame, groupOf?: (id: string) => string | undefined): TeamScene {
  const n = ids.length;
  const start: Point = { x: 14, y: frame.center.y };
  const join: Point = { x: frame.width - 14, y: frame.center.y };
  const dots: SceneDot[] = [
    { key: 'start', at: start },
    { key: 'join', at: join },
  ];

  if (n <= MAX_LANES) {
    const step = Math.min((frame.height - 100) / Math.max(n, 1), 64);
    const members: ScenePlacement[] = ids.map((id, i) => ({ id, at: { x: frame.center.x, y: frame.center.y + (i - (n - 1) / 2) * step } }));
    const edges: SceneEdge[] = [];
    members.forEach((m, i) => {
      const side = Math.sign(m.at.y - frame.center.y);
      edges.push(edge(`out-${i}`, start, m.at, side * -0.16, m.id, true, DOT_INSET, MEMBER_INSET));
      edges.push(edge(`in-${i}`, m.at, join, side * -0.16, m.id, true, MEMBER_INSET, DOT_INSET));
    });
    return { members, edges, dots };
  }

  // Many members: they sit in a grid inside one band — "all at once" — entered from the start and left towards the join.
  const bandLeft = 42;
  const bandRight = frame.width - 42;
  const padX = 16;
  const padY = 30;
  const boxW = bandRight - bandLeft - 2 * padX;
  const boxH = Math.max(frame.height - 2 * padY - 20, 1);
  // Captions are at most 16 characters, so the band can hold a column every 66 units.
  // With groups, each group fills rows of its own, so the band uses as many columns as it can hold; without, the usual grid.
  const grouped = ids.some((id) => groupOf?.(id));
  const cols = grouped ? Math.max(1, Math.min(n, Math.floor(boxW / 66))) : gridFor(n, boxW, boxH, 66).cols;
  const cellW = boxW / cols;
  // The rows: each group fills its own rows (a group is one block, not a run that wraps into the next group's row), every row being at most `cols` wide.
  const rowsOf: string[][] = [];
  let current: string[] = [];
  let currentGroup: string | undefined;
  for (const id of ids) {
    const group = groupOf?.(id);
    if (current.length > 0 && (current.length === cols || group !== currentGroup)) {
      rowsOf.push(current);
      current = [];
    }
    current.push(id);
    currentGroup = group;
  }
  if (current.length > 0) rowsOf.push(current);
  const cellH = Math.min(boxH / rowsOf.length, 96);
  const gridH = rowsOf.length * cellH;
  const top = frame.center.y - gridH / 2;
  const members: ScenePlacement[] = rowsOf.flatMap((rowIds, row) =>
    rowIds.map((id, col) => ({
      id,
      // A short row is centered, not pushed to the left.
      at: { x: bandLeft + padX + ((cols - rowIds.length) * cellW) / 2 + (col + 0.5) * cellW, y: top + (row + 0.5) * cellH },
    })),
  );
  const band: SceneBand = { x: bandLeft, y: top - 22, width: bandRight - bandLeft, height: gridH + 44 };
  const edges = [
    edge('in', start, { x: band.x, y: frame.center.y }, 0, 'any', true, DOT_INSET, 1),
    edge('out', { x: band.x + band.width, y: frame.center.y }, join, 0, 'all', true, 1, DOT_INSET),
  ];
  return { members, edges, dots, band };
}

/** Peers on a ring linked by the team's directed links; the first member is the entry, reached from outside the ring. */
export function handoffScene(ids: string[], links: AgUiTeamLink[], frame: SceneFrame): TeamScene {
  const n = ids.length;
  const members = ring(ids, frame, true);
  const at = new Map(members.map((m) => [m.id, m.at]));

  const edges = links
    .filter((l) => at.has(l.from) && at.has(l.to))
    .map((l, i) => edge(`link-${i}`, at.get(l.from)!, at.get(l.to)!, 0.22, l.to, true, MEMBER_INSET, MEMBER_INSET + 3));

  const dots: SceneDot[] = [];
  if (n > 0) {
    const entry: Point = onEllipse(frame, -Math.PI / 2, 1.34);
    dots.push({ key: 'start', at: entry });
    edges.push(edge('entry', entry, members[0]!.at, 0, members[0]!.id, true, DOT_INSET, MEMBER_INSET + 3));
  }
  return { members, edges, dots };
}

/** Peers on a ring, each linked to the conversation they all take part in at the center. */
export function groupChatScene(ids: string[], frame: SceneFrame): TeamScene {
  const members = ring(ids, frame);
  const edges = members.map((m, i) => edge(`spoke-${i}`, frame.center, m.at, 0, m.id, false, 12, MEMBER_INSET));
  return { members, edges, dots: [{ key: 'center', at: frame.center }] };
}

/** Lays out `ids` for a topology kind other than manager-led; `undefined` for the kind the graph draws as a constellation. */
export function sceneFor(kind: AgUiTeamTopologyKind, ids: string[], links: AgUiTeamLink[], frame: SceneFrame, groupOf?: (id: string) => string | undefined): TeamScene | undefined {
  switch (kind) {
    case 'sequential':
      return sequentialScene(ids, links, frame);
    case 'concurrent':
      return concurrentScene(ids, frame, groupOf);
    case 'handoff':
      return handoffScene(ids, links, frame);
    case 'group-chat':
      return groupChatScene(ids, frame);
    default:
      return undefined;
  }
}

/** Members evenly spaced on the ring, the first at the top. Those in the upper part carry their name above, away from the links inside the ring. */
function ring(ids: string[], frame: SceneFrame, keepFirstBelow = false): ScenePlacement[] {
  const n = Math.max(ids.length, 1);
  return ids.map((id, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const at = onEllipse(frame, angle);
    // The entry of a handoff is reached from above, so its name stays below it.
    return { id, at, labelAbove: Math.sin(angle) < -0.3 && !(keepFirstBelow && i === 0) };
  });
}

function edge(key: string, from: Point, to: Point, bend: number, lit: string, arrow: boolean, fromInset: number, toInset: number): SceneEdge {
  return { key, from, to, bend, lit, arrow, fromInset, toInset };
}

/** The point `inset` away from `a` on the way to `b`. */
export function shorten(a: Point, b: Point, inset: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const t = Math.min(inset / length, 0.45);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

// ── Groups ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A group of the team as drawn: the members' positions (for the soft zone behind them) and where its name badge sits. */
export interface SceneGroup {
  key: string;
  /** The group's name as written by the team editor. */
  name: string;
  ids: string[];
  points: Point[];
  /** Center of the badge. */
  label: Point;
  /** The soft zone behind the group, clear of everything that is not its own. */
  zone: ZoneShape;
}

/**
 * The soft zone behind a group, whatever the layout: a disc on each of its members (`points`) and a band along each of
 * `links`. It is `filled` (the area between its members too) only when nothing else of the drawing stands there.
 */
export interface ZoneShape {
  points: Point[];
  links: [Point, Point][];
  filled: boolean;
  /** Radius of the disc on each member; the band's half width when left out. */
  radius?: number;
  /**
   * The free areas between neighbouring members (triangles), for a drawing that fills what it can between neighbours rather
   * than all or nothing. Nothing that is not the group's stands in any of them.
   */
  areas?: Point[][];
  /** The shortest clear bands that keep the members together, whether or not the zone is `filled`. */
  ties?: [Point, Point][];
}

/** Half the width of a zone's band: the room a member's hexagon takes, and a little air. */
export const ZONE_HALF_WIDTH = 23;

/**
 * The room something takes in the drawing. `margin` is how far a zone's band must stay from it: the band's half width by
 * default (a shape the band must not touch at all, like a member's hexagon), less for something a band may brush past
 * (a name).
 */
export interface Obstacle {
  left: number;
  top: number;
  right: number;
  bottom: number;
  margin?: number;
}

/** Whether the segment `a`–`b` crosses `box` (or lies in it). */
function segmentHitsBox(a: Point, b: Point, box: Obstacle): boolean {
  // Liang–Barsky: the part of the segment inside the box, if any.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, a.x - box.left) && clip(dx, box.right - a.x) && clip(-dy, a.y - box.top) && clip(dy, box.bottom - a.y);
}

function inPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The zone of a group whose members sit at `points`, in a drawing where `obstacles` are the room taken by everything that is
 * not this group: the other members (names included), a manager, a start or a center point.
 *
 * One rule for every layout: a zone never passes over what is not its own. When the area between the members is free, the
 * zone is that whole area. When something stands in it (a group that goes round a manager, round a shared conversation, or
 * whose members are apart in a chain), the zone is only the bands that join its members without crossing anything — the
 * shortest ones that keep them together — and a member that cannot be joined keeps its own disc.
 */
export function zoneShape(points: Point[], obstacles: Obstacle[], halfWidth = ZONE_HALF_WIDTH): ZoneShape {
  const grown = obstacles.map((o) => {
    const m = o.margin ?? halfWidth;
    return { left: o.left - m, top: o.top - m, right: o.right + m, bottom: o.bottom + m };
  });
  const clear = (a: Point, b: Point) => !grown.some((o) => segmentHitsBox(a, b, o));

  const outline = points.map((p, i): [Point, Point] => [p, points[(i + 1) % points.length]!]);
  const filled = points.length >= 3 && outline.every(([a, b]) => clear(a, b)) && !obstacles.some((o) => inPolygon({ x: (o.left + o.right) / 2, y: (o.top + o.bottom) / 2 }, points));

  // The shortest clear bands that keep the members together (a spanning forest: Kruskal over the clear pairs).
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]!;
      const b = points[j]!;
      if (clear(a, b)) pairs.push([i, j, Math.hypot(a.x - b.x, a.y - b.y)]);
    }
  }
  pairs.sort((x, y) => x[2] - y[2]);
  const parent = points.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const links: [Point, Point][] = [];
  for (const [i, j] of pairs) {
    const a = find(i);
    const b = find(j);
    if (a === b) continue;
    parent[a] = b;
    links.push([points[i]!, points[j]!]);
  }

  // The free areas between neighbours: every triangle of members whose sides are clear, that holds nothing foreign, and
  // whose sides are not much longer than the bands that tie the group (so the zone grows between neighbours and never
  // closes itself round what it avoids).
  const reach = 1.5 * Math.max(0, ...links.map(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y)));
  const side = new Set(pairs.filter((p) => p[2] <= reach).map(([i, j]) => `${i}-${j}`));
  const centers = obstacles.map((o) => ({ x: (o.left + o.right) / 2, y: (o.top + o.bottom) / 2 }));
  const areas: Point[][] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (!side.has(`${i}-${j}`)) continue;
      for (let k = j + 1; k < points.length; k++) {
        if (!side.has(`${i}-${k}`) || !side.has(`${j}-${k}`)) continue;
        const triangle = [points[i]!, points[j]!, points[k]!];
        if (!centers.some((c) => inPolygon(c, triangle))) areas.push(triangle);
      }
    }
  }
  return filled ? { points, links: outline, filled, areas, ties: links } : { points, links, filled, areas, ties: links };
}

/**
 * Where the badge of the hub's own group goes when no other member shares that group: beside the hub, on the side farthest
 * from the groups around it (their directions from the center, in radians). `width` is the badge's.
 */
export function hubBadgeCenter(center: Point, hubRadius: number, width: number, branchAngles: number[]): Point {
  const sides: { angle: number; at: Point }[] = [
    { angle: -Math.PI / 2, at: { x: center.x, y: center.y - hubRadius - 18 } },
    // Below the hub its name comes first.
    { angle: Math.PI / 2, at: { x: center.x, y: center.y + hubRadius + 32 } },
    { angle: Math.PI, at: { x: center.x - hubRadius - 10 - width / 2, y: center.y } },
    { angle: 0, at: { x: center.x + hubRadius + 10 + width / 2, y: center.y } },
  ];
  const apart = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const room = (angle: number) => (branchAngles.length === 0 ? Math.PI : Math.min(...branchAngles.map((b) => apart(angle, b))));
  return sides.reduce((best, side) => (room(side.angle) > room(best.angle) + 1e-6 ? side : best)).at;
}

/**
 * The room a member takes in the drawing: its hexagon, which a band of another group never touches, and its name (below
 * it, or above), which a band stays just clear of.
 */
export function memberObstacles(at: Point, labelAbove = false, radius = 13): Obstacle[] {
  const nameTop = labelAbove ? at.y - radius - 17 : at.y + radius + 4;
  return [
    { left: at.x - radius, right: at.x + radius, top: at.y - radius, bottom: at.y + radius },
    { left: at.x - 26, right: at.x + 26, top: nameTop, bottom: nameTop + 12, margin: 5 },
  ];
}

const PILL_HEIGHT = 16;

/** Width of a group's badge: its name in capitals, a dot and the member count. */
export function pillWidth(name: string): number {
  return name.length * 6.9 + 38;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlaps = (a: Box, b: Box, margin = 2) => a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin;

/** The room a member takes up: its hexagon and its name, above or below. */
const memberBox = (m: ScenePlacement): Box => ({ left: m.at.x - 34, right: m.at.x + 34, top: m.at.y - (m.labelAbove ? 34 : 18), bottom: m.at.y + (m.labelAbove ? 18 : 28) });

/**
 * The groups of a scene, each with the badge carrying its name. A badge goes to the free place nearest its group: the frame
 * is scanned for positions clear of every member (name included), of the start / join / center dots and of the badges
 * already placed, and the one closest to the group's members — a little above them rather than below — wins.
 */
export function groupsFor(scene: TeamScene, groupOf: (id: string) => { key: string; name: string } | undefined, frame: SceneFrame): SceneGroup[] {
  const byKey = new Map<string, { name: string; placed: ScenePlacement[] }>();
  for (const placed of scene.members) {
    const group = groupOf(placed.id);
    if (!group) continue;
    const entry = byKey.get(group.key) ?? { name: group.name, placed: [] };
    entry.placed.push(placed);
    byKey.set(group.key, entry);
  }

  const obstacles: Box[] = [...scene.members.map(memberBox), ...scene.dots.map((d) => ({ left: d.at.x - 10, right: d.at.x + 10, top: d.at.y - 10, bottom: d.at.y + 10 }))];
  const taken: Box[] = [];
  const result: SceneGroup[] = [];

  for (const [key, { name, placed }] of byKey) {
    const points = placed.map((m) => m.at);
    const w = pillWidth(name);
    const centroidY = points.reduce((sum, q) => sum + q.y, 0) / points.length;
    const boxAt = (c: Point): Box => ({ left: c.x - w / 2, right: c.x + w / 2, top: c.y - PILL_HEIGHT / 2, bottom: c.y + PILL_HEIGHT / 2 });
    const free = (box: Box) => box.left >= 2 && box.right <= frame.width - 2 && box.top >= 2 && box.bottom <= frame.height - 2 && !obstacles.some((o) => overlaps(box, o)) && !taken.some((t) => overlaps(box, t));

    let best: Point | undefined;
    let bestScore = Infinity;
    for (let y = PILL_HEIGHT / 2 + 2; y <= frame.height - PILL_HEIGHT / 2 - 2; y += 4) {
      for (let x = w / 2 + 2; x <= frame.width - w / 2 - 2; x += 4) {
        const c = { x, y };
        if (!free(boxAt(c))) continue;
        const nearest = Math.min(...points.map((q) => Math.hypot(q.x - x, q.y - y)));
        const score = nearest + (y > centroidY ? 6 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }

    // Nothing free (a crowded frame): over the group's first member, kept in the frame.
    const label = best ?? clampToFrame({ x: points[0]!.x - 16 + w / 2, y: points[0]!.y - 33 }, w, frame);
    taken.push(boxAt(label));
    const others: Obstacle[] = [...scene.members.filter((m) => !placed.includes(m)).flatMap((m) => memberObstacles(m.at, m.labelAbove)), ...scene.dots.map((d) => ({ left: d.at.x - 10, right: d.at.x + 10, top: d.at.y - 10, bottom: d.at.y + 10 }))];
    result.push({ key, name, ids: placed.map((m) => m.id), points, label, zone: zoneShape(points, others) });
  }
  return result;
}

function clampToFrame(c: Point, width: number, frame: SceneFrame): Point {
  return {
    x: Math.min(Math.max(c.x, width / 2 + 2), Math.max(frame.width - width / 2 - 2, width / 2 + 2)),
    y: Math.min(Math.max(c.y, PILL_HEIGHT / 2 + 2), Math.max(frame.height - PILL_HEIGHT / 2 - 2, PILL_HEIGHT / 2 + 2)),
  };
}
