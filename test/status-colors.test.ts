import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8');
const alias = (name: string) => css.match(new RegExp(`^[ \\t]+${name}:[ \\t]*([^;]+);`, 'm'))?.[1].trim();

describe('the colors of a member and a step at work', () => {
  it('come from the palette, never from the theme', () => {
    for (const name of ['--ag-team-working', '--ag-workflow-working']) expect(alias(name)).not.toContain('var(');
  });

  it('keep waiting apart from working', () => {
    expect(alias('--ag-team-waiting')).not.toBe(alias('--ag-team-working'));
    expect(alias('--ag-workflow-waiting')).not.toBe(alias('--ag-workflow-working'));
  });
});
