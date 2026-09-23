import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COLOR_TOKENS, themeToCssVars, type ArtifactsThemeData, DEFAULT_ARTIFACTS_THEME } from '../src/artifacts/theme.js';
import { ArtifactsThemeProvider } from '../src/react/ArtifactsThemeProvider.js';

const brandedTheme: ArtifactsThemeData = {
  ...DEFAULT_ARTIFACTS_THEME,
  fontFamily: '"Karla", sans-serif',
  colors: { primary: '#171A1D', tertiary: '#E3A94F' },
};

describe('themeToCssVars', () => {
  it('falls back to DEFAULT_COLOR_TOKENS for an empty theme', () => {
    const vars = themeToCssVars(DEFAULT_ARTIFACTS_THEME);
    expect(vars['--ag-primary']).toBe(DEFAULT_COLOR_TOKENS.primary);
    expect(vars['--ag-surface-container-low']).toBe(DEFAULT_COLOR_TOKENS.surfaceContainerLow);
    expect(vars['fontFamily']).toBeUndefined();
  });

  it('overrides only the roles a theme sets, keeping the rest at default', () => {
    const theme: ArtifactsThemeData = { ...DEFAULT_ARTIFACTS_THEME, colors: { primary: '#171A1D' } };
    const vars = themeToCssVars(theme);
    expect(vars['--ag-primary']).toBe('#171A1D');
    expect(vars['--ag-outline']).toBe(DEFAULT_COLOR_TOKENS.outline);
  });

  it('includes fontFamily when the theme sets one', () => {
    const vars = themeToCssVars(brandedTheme);
    expect(vars['fontFamily']).toBe('"Karla", sans-serif');
    expect(vars['--ag-primary']).toBe('#171A1D');
    expect(vars['--ag-tertiary']).toBe('#E3A94F');
  });
});

describe('ArtifactsThemeProvider', () => {
  it('renders a display:contents wrapper carrying the theme as CSS custom properties', () => {
    const { container } = render(
      <ArtifactsThemeProvider theme={brandedTheme}>
        <span data-testid="child">hi</span>
      </ArtifactsThemeProvider>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.display).toBe('contents');
    expect(wrapper.style.getPropertyValue('--ag-primary')).toBe('#171A1D');
    expect(wrapper.style.getPropertyValue('--ag-tertiary')).toBe('#E3A94F');
    expect(wrapper.style.fontFamily).toBe('"Karla", sans-serif');
    expect(wrapper.querySelector('[data-testid="child"]')).not.toBeNull();
  });
});
