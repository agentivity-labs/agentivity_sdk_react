/**
 * Styling configuration for artifact widgets — port of `ag_artifacts_theme.dart`.
 *
 * Values are plain CSS-ready primitives (hex colors, CSS `box-shadow` strings,
 * pixel numbers) rather than Flutter's `Color`/`BoxShadow`/`EdgeInsets` types —
 * the React equivalent of a `ThemeExtension` is a Context provider (see
 * {@link ArtifactsThemeProvider}), not a `BuildContext` lookup, so there's no
 * `lerp`/animated-transition concept to port (CSS transitions handle that
 * declaratively if you want it).
 */
/**
 * Named color roles shared by every artifact/AG-UI widget — the single source
 * of truth behind the `--ag-*` CSS custom properties that components read
 * (e.g. `var(--ag-primary, #2563eb)`). Any role left `undefined` falls back
 * to that same literal, so an empty theme renders identically to today.
 *
 * This is deliberately a flat color-role map (Material Design 3-style),
 * independent of the shape/typography fields below — a theme can override
 * colors without touching card radius, and vice versa.
 */
export interface ArtifactsColorTokens {
  primary?: string;
  onPrimary?: string;
  primaryContainer?: string;
  onPrimaryContainer?: string;
  secondaryContainer?: string;
  onSecondaryContainer?: string;
  tertiary?: string;
  surface?: string;
  surfaceContainerLow?: string;
  surfaceContainerHigh?: string;
  surfaceContainerHighest?: string;
  outline?: string;
  outlineVariant?: string;
}

/** Defaults matching every component's inline `var(--ag-x, <fallback>)` literal today. */
export const DEFAULT_COLOR_TOKENS: Required<ArtifactsColorTokens> = {
  primary: '#2563eb',
  onPrimary: '#ffffff',
  primaryContainer: '#dbeafe',
  onPrimaryContainer: '#1e3a8a',
  secondaryContainer: '#f1f5f9',
  onSecondaryContainer: '#1e293b',
  tertiary: '#f59e0b',
  surface: '#ffffff',
  surfaceContainerLow: '#f8fafc',
  surfaceContainerHigh: '#eef1f5',
  surfaceContainerHighest: '#f1f5f9',
  outline: '#94a3b8',
  outlineVariant: '#e2e8f0',
};

/** Maps each {@link ArtifactsColorTokens} key to its `--ag-*` CSS custom property name. */
const COLOR_TOKEN_CSS_VARS: Record<keyof ArtifactsColorTokens, string> = {
  primary: '--ag-primary',
  onPrimary: '--ag-on-primary',
  primaryContainer: '--ag-primary-container',
  onPrimaryContainer: '--ag-on-primary-container',
  secondaryContainer: '--ag-secondary-container',
  onSecondaryContainer: '--ag-on-secondary-container',
  tertiary: '--ag-tertiary',
  surface: '--ag-surface',
  surfaceContainerLow: '--ag-surface-container-low',
  surfaceContainerHigh: '--ag-surface-container-high',
  surfaceContainerHighest: '--ag-surface-container-highest',
  outline: '--ag-outline',
  outlineVariant: '--ag-outline-variant',
};

export interface ArtifactsThemeData {
  /** Ordered hex color list for chart datasets. Falls back to {@link DEFAULT_PALETTE}. */
  chartPalette?: string[];

  /**
   * Color roles shared by every widget (buttons, selection states, borders,
   * containers — see {@link ArtifactsColorTokens}). `undefined` roles keep
   * their built-in default.
   */
  colors?: ArtifactsColorTokens;

  /**
   * CSS `font-family` applied to the whole artifact/AG-UI tree (headings,
   * body text, labels, buttons — everything except code blocks, which use
   * {@link codeFontFamily}). `undefined` → inherit from the host app.
   */
  fontFamily?: string;

  /** Corner radius (px) applied to every artifact card. */
  cardRadius: number;
  /** CSS `padding` shorthand for the card's content area. */
  cardPadding: string;
  /** Card background color. `undefined` → inherit (e.g. `var(--ag-surface)`). */
  cardBackground?: string;
  /** Card border color. `undefined` → inherit. */
  cardBorderColor?: string;
  /** Card border stroke width (px). */
  cardBorderWidth: number;
  /** CSS `box-shadow` value applied to each card. */
  cardShadow: string;

  /** Background of the type badge chip in the card header. */
  badgeBackground?: string;
  /** Text color of the type badge chip. */
  badgeForeground?: string;

  /** Base font size (px) for axis labels, legend dots, subtitles. */
  labelFontSize: number;
  /** Base font size (px) for the card header title. */
  headerFontSize: number;
  /** Base font size (px) for the main value in metric cards. */
  valueFontSize: number;
  /** CSS `font-family` for code blocks. `undefined` → monospace. */
  codeFontFamily?: string;
  /** Base font size (px) for code block source text. */
  codeFontSize: number;

  /** Font-size multiplier (1.0 = original). */
  fontScale: number;
  /** Spacing multiplier (1.0 = original). */
  spacingScale: number;
}

export const DEFAULT_ARTIFACTS_THEME: ArtifactsThemeData = {
  cardRadius: 5,
  cardPadding: '12px',
  cardBorderWidth: 1,
  cardShadow: 'none',
  labelFontSize: 10,
  headerFontSize: 12,
  valueFontSize: 28,
  codeFontSize: 12,
  fontScale: 1,
  spacingScale: 1,
};

/** Default palette used when no theme is provided and the agent doesn't specify colors. */
export const DEFAULT_PALETTE: string[] = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export function effectivePalette(theme: ArtifactsThemeData): string[] {
  return theme.chartPalette ?? DEFAULT_PALETTE;
}

export function effectiveLabelFontSize(theme: ArtifactsThemeData): number {
  return theme.labelFontSize * theme.fontScale;
}

export function effectiveHeaderFontSize(theme: ArtifactsThemeData): number {
  return theme.headerFontSize * theme.fontScale;
}

export function effectiveValueFontSize(theme: ArtifactsThemeData): number {
  return theme.valueFontSize * theme.fontScale;
}

export function effectiveCodeFontSize(theme: ArtifactsThemeData): number {
  return theme.codeFontSize * theme.fontScale;
}

/** Parses "8px 12px"-style shorthand and scales every value by `spacingScale`. */
export function effectiveCardPadding(theme: ArtifactsThemeData): string {
  if (theme.spacingScale === 1) return theme.cardPadding;
  return theme.cardPadding
    .split(/\s+/)
    .map((part) => {
      const match = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(part);
      if (!match) return part;
      const value = Number.parseFloat(match[1]!) * theme.spacingScale;
      return `${value}${match[2] ?? 'px'}`;
    })
    .join(' ');
}

export function mergeArtifactsTheme(base: ArtifactsThemeData, overrides: Partial<ArtifactsThemeData>): ArtifactsThemeData {
  return { ...base, ...overrides };
}

/**
 * Renders a theme's {@link ArtifactsColorTokens} (merged over
 * {@link DEFAULT_COLOR_TOKENS}) plus `fontFamily` as a CSS custom-property /
 * inline-style object — what {@link ArtifactsThemeProvider} spreads onto its
 * wrapper so every descendant widget's `var(--ag-primary, ...)` reference
 * resolves to the theme's actual value instead of always hitting its literal
 * fallback. This is the one place color tokens turn into `--ag-*` names —
 * widgets never construct that mapping themselves.
 */
export function themeToCssVars(theme: ArtifactsThemeData): Record<string, string> {
  const tokens = { ...DEFAULT_COLOR_TOKENS, ...theme.colors };
  const vars: Record<string, string> = {};
  for (const key of Object.keys(COLOR_TOKEN_CSS_VARS) as (keyof ArtifactsColorTokens)[]) {
    vars[COLOR_TOKEN_CSS_VARS[key]] = tokens[key];
  }
  if (theme.fontFamily) vars['fontFamily'] = theme.fontFamily;
  return vars;
}
