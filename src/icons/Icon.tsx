import type { CSSProperties, ReactNode } from 'react';
import { MATERIAL_TYPE, type IconRef } from './icon-ref.js';

/**
 * Draws an {@link IconRef}. The standard set is Material Icons, drawn from the font the SDK ships
 * (`material-icons.woff2`, declared in `styles.css`): the glyph is the character at the icon's code point, exactly how
 * Flutter draws it. An app that does not use `styles.css` must declare the `Agentivity Material Icons` font-face itself.
 */

/** The character to draw for an icon reference — `undefined` for no icon, a set this SDK does not draw, or a value that is not a code point. */
export function iconGlyph(icon: IconRef | undefined): string | undefined {
  if (icon?.type !== MATERIAL_TYPE) return undefined;
  if (!/^[0-9a-fA-F]{1,6}$/.test(icon.value)) return undefined;
  const codePoint = parseInt(icon.value, 16);
  return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : undefined;
}

export interface IconProps {
  /** The icon to draw. */
  icon: IconRef | undefined;
  /** What to draw when there is no icon, or one of a set this SDK does not draw (initials, typically). Nothing by default. */
  fallback?: ReactNode;
  /** Width and height; defaults to `1.15em` so the glyph scales with the surrounding text. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Position when nested inside an `<svg>` (a graph): the icon is then drawn as SVG text in a `size` box at (x, y). */
  x?: number;
  y?: number;
}

/** An icon: an inline glyph, drawn in the surrounding text color — or SVG text when positioned inside an `<svg>`. */
export function Icon({ icon, fallback, size = '1.15em', className, style, x, y }: IconProps) {
  const glyph = iconGlyph(icon);
  if (glyph === undefined) return <>{fallback}</>;

  const classes = className ? `ag-icon ${className}` : 'ag-icon';
  if (x !== undefined || y !== undefined) {
    const box = typeof size === 'number' ? size : 24;
    return (
      <text className={classes} style={style} x={(x ?? 0) + box / 2} y={(y ?? 0) + box / 2} fontSize={box} textAnchor="middle" dominantBaseline="central" aria-hidden="true">
        {glyph}
      </text>
    );
  }
  return (
    <span className={classes} style={{ fontSize: size, ...style }} aria-hidden="true">
      {glyph}
    </span>
  );
}
