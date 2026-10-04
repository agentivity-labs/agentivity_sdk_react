import { describe, expect, it } from 'vitest';
import { withAlpha } from '../src/artifacts/color-utils.js';

describe('withAlpha', () => {
  it('turns a hex color into an rgba tint', () => {
    expect(withAlpha('#10b981', 0.08)).toBe('rgba(16,185,129,0.08)');
  });

  it('keeps a CSS variable a tint instead of passing it through opaque', () => {
    expect(withAlpha('var(--ag-primary, #2563eb)', 0.08)).toBe('color-mix(in srgb, var(--ag-primary, #2563eb) 8%, transparent)');
  });
});
