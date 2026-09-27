import type { IconRef } from './icon-ref.js';

/**
 * One icon of the platform's catalog (`GET /api/v1/icons`): what an {@link IconRef} designates. The catalog is generic —
 * organised by icon set (`type`) — so it serves any screen that lets a user pick an icon.
 */
export interface IconInfo {
  /** The icon set (`material` today). */
  type: string;
  /** The icon inside that set: the Material code point, in hex (`E322`). This is what is stored. */
  value: string;
  /** The Material name (`hotel_baseline`) — for search and tooltips only, never stored. */
  name: string;
}

export function parseIconInfo(json: Record<string, unknown>): IconInfo {
  const text = (v: unknown) => (v == null ? '' : String(v).trim());
  return { type: text(json['type']).toLowerCase(), value: text(json['value']).toUpperCase(), name: text(json['name']) };
}

/** The reference to store for a catalog entry. */
export const iconRefOf = (info: IconInfo): IconRef => ({ type: info.type, value: info.value });
