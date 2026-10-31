import { describe, expect, it } from 'vitest';
import { KIND_ICON } from '../src/chat/components/WorkflowGraph';

// The bundled font is Flutter's MaterialIcons: Google's codes show another icon there (a bed, a snowflake).
describe('the icons of a workflow graph', () => {
  it('uses the codes of the bundled font', () => {
    expect(KIND_ICON).toEqual({ start: 'E4CB', decision: 'E12D', human: 'E153', ai: 'E3DB', end: 'E156', action: 'E57F' });
  });
});
