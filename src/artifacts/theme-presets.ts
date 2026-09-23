import { DEFAULT_ARTIFACTS_THEME, type ArtifactsThemeData } from './theme.js';

/** Pre-built {@link ArtifactsThemeData} presets — port of `ag_artifacts_themes.dart`. */

/** **Neutral** — Built-in defaults. Blends into any app without configuration. */
export const neutral: ArtifactsThemeData = DEFAULT_ARTIFACTS_THEME;

/** **Glacier** — Ultra-clean SaaS. Soft shadows, generous radius, cool blue-to-purple palette. */
export const glacier: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  chartPalette: ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'],
  cardRadius: 12,
  cardShadow: '0px 4px 16px -2px rgba(0,0,0,0.047)',
  labelFontSize: 10,
  colors: { primary: '#0ea5e9', onPrimary: '#ffffff', primaryContainer: '#e0f2fe', onPrimaryContainer: '#075985', outlineVariant: '#e0e7ef' },
};

/** **Brutalist** — Neo-brutalism. Zero radius, thick black border, hard offset shadow. */
export const brutalist: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  chartPalette: ['#ff5f1f', '#1400ff', '#00d492', '#ff0099', '#ffd100', '#7928ca', '#00b4d8', '#f72585'],
  cardRadius: 0,
  cardBorderColor: '#000000',
  cardBorderWidth: 2.5,
  cardShadow: '5px 5px 0px 0px rgba(0,0,0,1)',
  badgeBackground: '#000000',
  badgeForeground: '#ffd100',
  labelFontSize: 9.5,
  headerFontSize: 11.5,
  colors: { primary: '#1400ff', onPrimary: '#ffffff', primaryContainer: '#ffd100', onPrimaryContainer: '#000000', outline: '#000000', outlineVariant: '#000000' },
};

/** **Paper** — Editorial warmth. Ivory background, desaturated ink palette. */
export const paper: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  chartPalette: ['#c2410c', '#0369a1', '#15803d', '#7e22ce', '#b45309', '#0f766e', '#be185d', '#1e40af'],
  cardRadius: 2,
  cardBackground: '#faf7f2',
  cardBorderColor: '#d9d0c0',
  cardBorderWidth: 1,
  badgeBackground: '#f0e8d8',
  badgeForeground: '#78350f',
  labelFontSize: 9.5,
  colors: { primary: '#c2410c', onPrimary: '#ffffff', primaryContainer: '#f0e8d8', onPrimaryContainer: '#78350f', surface: '#faf7f2', surfaceContainerLow: '#f3ede1', outline: '#b8ab92', outlineVariant: '#d9d0c0' },
};

/** **Candy** — Consumer-friendly. Rounded corners, soft shadows, vivid purple-pink-teal palette. */
export const candy: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  chartPalette: ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#6366f1', '#f97316', '#14b8a6'],
  cardRadius: 16,
  cardShadow: '0px 6px 20px -2px rgba(139,92,246,0.102)',
  badgeBackground: '#ede9fe',
  badgeForeground: '#7c3aed',
  labelFontSize: 10,
  colors: { primary: '#8b5cf6', onPrimary: '#ffffff', primaryContainer: '#ede9fe', onPrimaryContainer: '#5b21b6' },
};

/** **Noir** — Premium financial dark. Near-black card, gold palette. */
export const noir: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  chartPalette: ['#f59e0b', '#d97706', '#fbbf24', '#e5e7eb', '#9ca3af', '#6b7280', '#fde68a', '#b45309'],
  cardRadius: 3,
  cardBackground: '#0a0a0a',
  cardBorderColor: '#222222',
  cardBorderWidth: 1,
  cardShadow: '0px 8px 24px 0px rgba(0,0,0,1)',
  badgeBackground: '#1a1a1a',
  badgeForeground: '#d97706',
  labelFontSize: 9.5,
  headerFontSize: 11.5,
  valueFontSize: 26,
  colors: { primary: '#d97706', onPrimary: '#0a0a0a', primaryContainer: '#3d2a0a', onPrimaryContainer: '#fde68a', surface: '#0a0a0a', surfaceContainerLow: '#141414', surfaceContainerHigh: '#1f1f1f', surfaceContainerHighest: '#292929', outline: '#3a3a3a', outlineVariant: '#222222' },
};

/** **Aurora** — Dark with a full-spectrum palette. Teal to violet to rose. */
export const aurora: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  chartPalette: ['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#f97316', '#0ea5e9'],
  cardRadius: 8,
  cardBackground: '#0d1117',
  cardBorderColor: '#21262d',
  cardShadow: '0px 6px 20px 0px rgba(0,0,0,0.251)',
  badgeBackground: '#161b22',
  badgeForeground: '#58a6ff',
  colors: { primary: '#58a6ff', onPrimary: '#0d1117', primaryContainer: '#132638', onPrimaryContainer: '#a5d3ff', surface: '#0d1117', surfaceContainerLow: '#111826', surfaceContainerHigh: '#1c2531', surfaceContainerHighest: '#242e3c', outline: '#3d4753', outlineVariant: '#21262d' },
};

/** **Velvet** — Deep purple luxury dark. Violet-to-gold palette, subtle purple glow. */
export const velvet: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  chartPalette: ['#7c3aed', '#a78bfa', '#c4b5fd', '#fbbf24', '#34d399', '#f472b6', '#38bdf8', '#fb923c'],
  cardRadius: 10,
  cardBackground: '#0f0722',
  cardBorderColor: '#2d1b6b',
  cardShadow: '0px 8px 24px 0px rgba(124,58,237,0.4)',
  badgeBackground: '#1e0f4e',
  badgeForeground: '#a78bfa',
  colors: { primary: '#a78bfa', onPrimary: '#0f0722', primaryContainer: '#1e0f4e', onPrimaryContainer: '#e4d9ff', surface: '#0f0722', surfaceContainerLow: '#160b32', surfaceContainerHigh: '#20123f', surfaceContainerHighest: '#2a184e', outline: '#4a2f8f', outlineVariant: '#2d1b6b' },
};

/** **Ember** — Warm dark. Fire-orange palette with an amber glow. */
export const ember: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  chartPalette: ['#ff6b35', '#f7931e', '#ffd23f', '#ee4266', '#06d6a0', '#f77f00', '#fcbf49', '#ef233c'],
  cardRadius: 5,
  cardBackground: '#1c0f07',
  cardBorderColor: '#3d1f0a',
  cardShadow: '0px 6px 16px 0px rgba(255,107,53,0.302)',
  badgeBackground: '#3d1f0a',
  badgeForeground: '#f7931e',
  colors: { primary: '#f7931e', onPrimary: '#1c0f07', primaryContainer: '#3d1f0a', onPrimaryContainer: '#ffd23f', surface: '#1c0f07', surfaceContainerLow: '#241407', surfaceContainerHigh: '#301a08', surfaceContainerHighest: '#3d220b', outline: '#5a3312', outlineVariant: '#3d1f0a' },
};

/** **Terminal** — Dev/hacker aesthetic. GitHub dark background, green phosphor accents. */
export const terminal: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  chartPalette: ['#39d353', '#58a6ff', '#f78166', '#ffa657', '#d2a8ff', '#56d364', '#79c0ff', '#ffa198'],
  cardRadius: 0,
  cardBackground: '#0d1117',
  cardBorderColor: '#30363d',
  cardBorderWidth: 1,
  cardShadow: 'none',
  badgeBackground: '#161b22',
  badgeForeground: '#39d353',
  codeFontFamily: 'monospace',
  codeFontSize: 11.5,
  labelFontSize: 9.5,
  headerFontSize: 11,
  fontFamily: 'monospace',
  colors: { primary: '#39d353', onPrimary: '#0d1117', primaryContainer: '#0f2a17', onPrimaryContainer: '#7ee2a8', surface: '#0d1117', surfaceContainerLow: '#111722', surfaceContainerHigh: '#1c2128', surfaceContainerHighest: '#242a32', outline: '#484f58', outlineVariant: '#30363d' },
};

/** **Agentivity Light** — Official Agentivity Studio theme, light surface. */
export const agentivityLight: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  chartPalette: ['#8B61FF', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316'],
  cardRadius: 5,
  cardShadow: '0px 2px 6px 0px rgba(0,0,0,0.051)',
  badgeBackground: '#F0ECFF',
  badgeForeground: '#6B3FE0',
  labelFontSize: 9.5,
  headerFontSize: 11,
  colors: { primary: '#8B61FF', onPrimary: '#ffffff', primaryContainer: '#F0ECFF', onPrimaryContainer: '#6B3FE0' },
};

/** **Agentivity** — alias for {@link agentivityLight}. Kept for backward compat. */
export const agentivity: ArtifactsThemeData = agentivityLight;

/** **Agentivity Dark** — Official Agentivity Studio theme, dark surface. */
export const agentivityDark: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  chartPalette: ['#8B61FF', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316'],
  cardRadius: 5,
  cardBackground: '#1E1E1E',
  cardBorderColor: '#2A2A2A',
  cardShadow: '0px 2px 8px 0px rgba(0,0,0,0.251)',
  badgeBackground: '#2D2040',
  badgeForeground: '#8B61FF',
  labelFontSize: 9.5,
  headerFontSize: 11,
  colors: { primary: '#8B61FF', onPrimary: '#ffffff', primaryContainer: '#2D2040', onPrimaryContainer: '#C8B6FF', surface: '#1E1E1E', surfaceContainerLow: '#232323', surfaceContainerHigh: '#2A2A2A', surfaceContainerHighest: '#323232', outline: '#3d3d3d', outlineVariant: '#2A2A2A' },
};

/** All available themes keyed by display name. */
export const ARTIFACTS_THEMES: Record<string, ArtifactsThemeData> = {
  Neutral: neutral,
  Glacier: glacier,
  Brutalist: brutalist,
  Paper: paper,
  Candy: candy,
  Noir: noir,
  Aurora: aurora,
  Velvet: velvet,
  Ember: ember,
  Terminal: terminal,
  Agentivity: agentivity,
  'Agentivity Light': agentivityLight,
  'Agentivity Dark': agentivityDark,
};

/** Recommended color-scheme ('light' | 'dark') for each theme. */
export const ARTIFACTS_THEME_BRIGHTNESS: Record<string, 'light' | 'dark'> = {
  Neutral: 'light',
  Glacier: 'light',
  Brutalist: 'light',
  Paper: 'light',
  Candy: 'light',
  Noir: 'dark',
  Aurora: 'dark',
  Velvet: 'dark',
  Ember: 'dark',
  Terminal: 'dark',
  Agentivity: 'light',
  'Agentivity Light': 'light',
  'Agentivity Dark': 'dark',
};
