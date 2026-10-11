import { describe, expect, it } from 'vitest';
import { memberObstacles, zoneShape, ZONE_HALF_WIDTH, type Point } from '../src/chat/components/team-layouts.js';

const distance = (p: Point, a: Point, b: Point) => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby)));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
};

// One group of three all round a manager (manager-led), or round the shared conversation (group chat): same geometry.
const center = { x: 200, y: 190 };
const around = [
  { x: 200, y: 60 },
  { x: 330, y: 270 },
  { x: 70, y: 270 },
];

describe('the zone of a group', () => {
  it('is not drawn over what it goes round: bands between its members, no filled area', () => {
    const zone = zoneShape(around, memberObstacles(center, false, 21));
    expect(zone.filled).toBe(false);
    // The three members stay one group: two bands, passing clear of the manager.
    expect(zone.links).toHaveLength(2);
    for (const [a, b] of zone.links) expect(distance(center, a, b)).toBeGreaterThan(ZONE_HALF_WIDTH + 21);
  });

  it('is one filled area when nothing stands between its members, as before', () => {
    const zone = zoneShape(around, memberObstacles({ x: 380, y: 20 }));
    expect(zone.filled).toBe(true);
    expect(zone.links).toHaveLength(3);
  });

  it('does not join two members through the center between them', () => {
    const zone = zoneShape([{ x: 70, y: 190 }, { x: 330, y: 190 }], [{ left: 190, right: 210, top: 180, bottom: 200 }]);
    expect(zone.links).toHaveLength(0);
    expect(zone.points).toHaveLength(2);
  });

  it('does not pass over a member of another group that sits between two of its own (a chain)', () => {
    const zone = zoneShape([{ x: 60, y: 100 }, { x: 260, y: 100 }], memberObstacles({ x: 160, y: 100 }));
    expect(zone.links).toHaveLength(0);
  });

  it('joins the members the other way round when a direct band is barred', () => {
    const ring = [{ x: 200, y: 60 }, { x: 330, y: 190 }, { x: 200, y: 320 }, { x: 70, y: 190 }];
    const zone = zoneShape(ring, memberObstacles(center, false, 21));
    expect(zone.filled).toBe(false);
    expect(zone.links).toHaveLength(3);
  });
});
