import { DEFAULT_PALETTE, effectivePalette, type ArtifactsThemeData } from './theme.js';

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Validates a hex color string (`#RGB`, `#RRGGBB`, or `#AARRGGBB` — Flutter's
 * `ARGB` order) and normalizes it to a CSS-ready `#RRGGBB`/`#RRGGBBAA` string,
 * or returns `fallback`. CSS accepts hex colors natively, so (unlike the
 * Flutter SDK's `parseColor`) there's no need to parse into a numeric color
 * object — this just validates and reorders alpha to CSS's `#RRGGBBAA`.
 */
export function parseColor(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback;
  const cleaned = hex.replace('#', '');
  if (!HEX_RE.test(cleaned)) return fallback;
  if (cleaned.length === 8) {
    // Flutter's #AARRGGBB -> CSS's #RRGGBBAA
    return `#${cleaned.slice(2)}${cleaned.slice(0, 2)}`;
  }
  return `#${cleaned}`;
}

/** Returns the `index`-th color from `DEFAULT_PALETTE`. */
export function paletteColor(index: number): string {
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]!;
}

/** Returns the `index`-th color from the theme's effective palette. */
export function paletteColorOf(theme: ArtifactsThemeData, index: number): string {
  const palette = effectivePalette(theme);
  return palette[index % palette.length]!;
}

/** Applies `alpha` to a `#RRGGBB` hex color, returning a CSS `rgba(...)` string. Passes CSS var()/named colors through unchanged. */
export function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color;
  const cleaned = color.replace('#', '');
  if (cleaned.length < 6) return color;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Relative-luminance estimate (sRGB) — mirrors `ThemeData.estimateBrightnessForColor`. */
export function isDarkColor(hex: string): boolean {
  const cleaned = hex.replace('#', '');
  if (cleaned.length < 6) return false;
  const r = Number.parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = Number.parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = Number.parseInt(cleaned.slice(4, 6), 16) / 255;
  // Perceptual luminance (Rec. 709).
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.5;
}
