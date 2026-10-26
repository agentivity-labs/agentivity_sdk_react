import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8');
const alias = (name: string) => css.match(new RegExp(`^[ \\t]+${name}:[ \\t]*([^;]+);`, 'm'))?.[1].trim();

describe('the colors of a member and a step at work', () => {
  it('follow the accent of the theme, never its tertiary color, a red in several themes that reads as a failure', () => {
    for (const name of ['--ag-team-working', '--ag-workflow-working']) {
      expect(alias(name)).toContain('--ag-primary');
      expect(alias(name)).not.toContain('--ag-tertiary');
    }
  });

  it('keep waiting apart from working', () => {
    expect(alias('--ag-team-waiting')).not.toBe(alias('--ag-team-working'));
    expect(alias('--ag-workflow-waiting')).not.toBe(alias('--ag-workflow-working'));
  });
});
