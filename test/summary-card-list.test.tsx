import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryCard } from '../src/artifacts/components/interaction/SummaryCard.js';

// A recap reads its facts as label and value, the value on the right. A section marked "list" holds lines of text instead
// (the steps of a plan): they read from the left, like any other text of the conversation.
describe('SummaryCard list sections', () => {
  it('keeps the value of a fact on the right', () => {
    render(<SummaryCard props={{ sections: [{ items: [{ key: 'Price', value: '$499' }] }] }} />);
    expect(screen.getByText('$499').style.textAlign).toBe('right');
  });

  it('reads the lines of a list section from the left', () => {
    const line = 'A support team that answers customer e-mails from your own data and articles';
    render(<SummaryCard props={{ sections: [{ label: 'What I will build', list: true, items: [{ key: '1', value: line }] }] }} />);
    expect(screen.getByText(line).style.textAlign).toBe('left');
  });
});
