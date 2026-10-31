/**
 * How a Team member's group looks: the color it shares with the other members of the group, and the order that keeps a
 * group together. (The icon a member wears is an {@link IconRef}, drawn by `Icon` — see `src/icons`.)
 */

/** Colors given to groups, in the order groups first appear in a team. */
export const TEAM_GROUP_PALETTE: readonly string[] = ['#FF8A5B', '#4FD1C5', '#F6C453', '#A78BFA', '#60A5FA', '#F472B6', '#84CC16', '#FB7185'];

/** The identity of a group — trimmed and case-insensitive, so "Booking" and "booking " are the same group. */
export function teamGroupKey(group: string | undefined | null): string | undefined {
  const key = group?.trim().toLowerCase();
  return key ? key : undefined;
}

/**
 * A color for each group of `groups`: the one the team editor chose (`custom`, by group key) or else the default, assigned
 * in order of first appearance and cycling through {@link TEAM_GROUP_PALETTE} — deterministic for a given team, and the
 * same rule in every SDK.
 */
export function teamGroupColors(groups: Iterable<string | undefined | null>, custom?: ReadonlyMap<string, string>): Map<string, string> {
  const colors = new Map<string, string>();
  for (const group of groups) {
    const key = teamGroupKey(group);
    if (key && !colors.has(key)) colors.set(key, custom?.get(key) ?? TEAM_GROUP_PALETTE[colors.size % TEAM_GROUP_PALETTE.length]!);
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
