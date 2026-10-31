import { DEFAULT_GRAPH_PALETTE } from '../../palettes/graph-palettes.js';

/**
 * How a Team member's group looks: the color it shares with the other members of the group, and the order that keeps a
 * group together. (The icon a member wears is an {@link IconRef}, drawn by `Icon` — see `src/icons`.)
 */

/** Colors given to groups by default, in the order groups first appear in a team: the default palette's. */
export const TEAM_GROUP_PALETTE: readonly string[] = DEFAULT_GRAPH_PALETTE.groups;

/** The identity of a group — trimmed and case-insensitive, so "Booking" and "booking " are the same group. */
export function teamGroupKey(group: string | undefined | null): string | undefined {
  const key = group?.trim().toLowerCase();
  return key ? key : undefined;
}

/**
 * A color for each group of `groups`: the one the team editor chose (`custom`, by group key) or else the palette's
 * (`palette`, by default {@link TEAM_GROUP_PALETTE}), assigned in order of first appearance and cycling through it — deterministic for a given team, and the
 * same rule in every SDK.
 */
export function teamGroupColors(groups: Iterable<string | undefined | null>, custom?: ReadonlyMap<string, string>, palette: readonly string[] = TEAM_GROUP_PALETTE): Map<string, string> {
  const colors = new Map<string, string>();
  for (const group of groups) {
    const key = teamGroupKey(group);
    if (key && !colors.has(key)) colors.set(key, custom?.get(key) ?? palette[colors.size % palette.length]!);
  }
  return colors;
}

/** The group colors the team editor chose, read off members carrying a `groupColor`. */
export function groupColorOverrides(members: Iterable<{ group?: string | null; groupColor?: string }>): Map<string, string> {
  const overrides = new Map<string, string>();
  for (const m of members) {
    const key = teamGroupKey(m.group);
    if (key && m.groupColor) overrides.set(key, m.groupColor);
  }
  return overrides;
}

/**
 * `items` with the members of each group kept together — groups in order of first appearance, ungrouped members last,
 * original order preserved inside each. Used so a graph draws a group as one cluster.
 */
export function orderByGroup<T>(items: Iterable<T>, groupOf: (item: T) => string | undefined | null): T[] {
  const list = [...items];
  const order: string[] = [];
  for (const item of list) {
    const key = teamGroupKey(groupOf(item));
    if (key && !order.includes(key)) order.push(key);
  }
  const rank = (item: T) => {
    const key = teamGroupKey(groupOf(item));
    return key ? order.indexOf(key) : order.length;
  };
  return list.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map((e) => e.item);
}
