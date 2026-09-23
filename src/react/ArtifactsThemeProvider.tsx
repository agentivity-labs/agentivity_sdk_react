import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_ARTIFACTS_THEME, themeToCssVars, type ArtifactsThemeData } from '../artifacts/theme.js';

const ArtifactsThemeContext = createContext<ArtifactsThemeData>(DEFAULT_ARTIFACTS_THEME);

export interface ArtifactsThemeProviderProps {
  theme: ArtifactsThemeData;
  children: ReactNode;
}

/**
 * Provides an {@link ArtifactsThemeData} to every artifact/AG-UI widget in
 * the tree — the React equivalent of registering `AgArtifactsThemeData` as a
 * Flutter `ThemeExtension`.
 *
 * Two things happen here, both from the same `theme` object: the raw data is
 * put on context for widgets (like `ArtifactCard`) that read it directly via
 * {@link useArtifactsTheme}, and `theme.colors`/`theme.fontFamily` are also
 * rendered as `--ag-*` CSS custom properties (via {@link themeToCssVars}) on
 * a wrapper `div` — that's what every other widget's `var(--ag-primary, ...)`
 * resolves against, so **all** widgets — cards, charts, choice/question/date
 * forms, chat, activity/run panels — share one color and font source instead
 * of each hardcoding its own fallback. The wrapper uses `display: contents`
 * so it never affects layout; CSS custom properties still cascade through it.
 *
 * ```tsx
 * import { ArtifactsThemeProvider, agentivityLight } from '@agentivity-labs/sdk-react';
 *
 * <ArtifactsThemeProvider theme={agentivityLight}>
 *   <App />
 * </ArtifactsThemeProvider>
 * ```
 */
export function ArtifactsThemeProvider({ theme, children }: ArtifactsThemeProviderProps) {
  const style = useMemo(() => themeToCssVars(theme) as CSSProperties, [theme]);
  return (
    <ArtifactsThemeContext.Provider value={theme}>
      <div style={{ display: 'contents', ...style }}>{children}</div>
    </ArtifactsThemeContext.Provider>
  );
}

/** Reads the nearest {@link ArtifactsThemeData}, or the built-in defaults when none is provided. */
export function useArtifactsTheme(): ArtifactsThemeData {
  return useContext(ArtifactsThemeContext);
}
