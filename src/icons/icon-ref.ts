/**
 * A reference to an icon — the same shape as the backend's `NodeIconDef` (`{ type, value, color? }`): `type` names the
 * icon set, `value` the icon inside it.
 *
 * Only the standard set, `material`, is drawn for now: Material Icons, identified by code point — the very font Flutter
 * bundles, so an icon is the same glyph in Studio, the Flutter SDK and here. A reference of any other type is kept as-is
 * but draws nothing: callers fall back to initials (or their own default), so a set added later needs no change to what
 * is already stored.
 */
export interface IconRef {
  /** The icon set — `material` today. */
  type: string;
  /** The icon inside that set: for `material`, its code point in hex (`E322`). */
  value: string;
  /** A tint, for sets that take one. Unused by `material`. */
  color?: string;
}

/** The standard icon set. */
export const MATERIAL_TYPE = 'material';

/** A reference to the Material icon at a code point, in hex (`E322`). */
export const materialIcon = (hexCodePoint: string): IconRef => ({ type: MATERIAL_TYPE, value: hexCodePoint });

/** Reads an icon reference off a JSON payload; `undefined` when it is absent or not a `{ type, value }` object. */
export function parseIconRef(raw: unknown): IconRef | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const type = typeof r['type'] === 'string' ? r['type'].trim().toLowerCase() : '';
  const value = typeof r['value'] === 'string' ? r['value'].trim() : '';
  if (!type || !value) return undefined;
  const color = typeof r['color'] === 'string' && r['color'].trim() ? r['color'].trim() : undefined;
  return color ? { type, value, color } : { type, value };
}
