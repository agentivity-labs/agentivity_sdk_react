import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionForm } from '../src/artifacts/components/interaction/QuestionForm.js';

describe('QuestionForm', () => {
  it('defaults every question to a plain text field', () => {
    render(<QuestionForm props={{ questions: [{ id: 'name', label: 'Your name' }] }} />);
    expect(document.querySelector('input[type="text"]')).not.toBeNull();
    expect(document.querySelectorAll('input')).toHaveLength(1);
  });

  it('renders a native date field for a date question, and reports the answer as its ISO date', () => {
    const onSubmit = vi.fn();
    render(<QuestionForm props={{ questions: [{ id: 'start', label: 'Departure date', type: 'date' }], __onSubmit: onSubmit }} />);

    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: '2027-07-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(onSubmit).toHaveBeenCalledWith('• Departure date → 2027-07-01');
  });

  it('renders a numeric field for a number question', () => {
    const onSubmit = vi.fn();
    render(<QuestionForm props={{ questions: [{ id: 'age', label: "Son's age", type: 'number' }], __onSubmit: onSubmit }} />);

    const input = document.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(onSubmit).toHaveBeenCalledWith("• Son's age → 17");
  });

  it('renders Yes/No buttons for a boolean question, and reports the picked one', () => {
    const onSubmit = vi.fn();
    render(<QuestionForm props={{ questions: [{ id: 'car', label: 'Need a rental car?', type: 'boolean' }], __onSubmit: onSubmit }} />);

    expect(document.querySelector('input')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(onSubmit).toHaveBeenCalledWith('• Need a rental car? → No');
  });

  it('an unknown type falls back to text, so a client ahead of an older SDK never breaks', () => {
    const onSubmit = vi.fn();
    render(<QuestionForm props={{ questions: [{ id: 'x', label: 'X', type: 'currency' }], __onSubmit: onSubmit }} />);

    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'EUR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(onSubmit).toHaveBeenCalledWith('• X → EUR');
  });

  it('mixes types in one form and reports every answered question, skipping blanks', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionForm
        props={{
          questions: [
            { id: 'dest', label: 'Destination', type: 'text' },
            { id: 'start', label: 'Departure date', type: 'date' },
            { id: 'travelers', label: 'Travelers', type: 'number' },
            { id: 'kids', label: 'Traveling with kids?', type: 'boolean' },
            { id: 'notes', label: 'Anything else?', type: 'text', required: false },
          ],
          __onSubmit: onSubmit,
        }}
      />,
    );

    fireEvent.change(document.querySelector('input[type="text"]')!, { target: { value: 'Barcelona' } });
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2027-07-01' } });
    fireEvent.change(document.querySelector('input[type="number"]')!, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(onSubmit).toHaveBeenCalledWith(['• Destination → Barcelona', '• Departure date → 2027-07-01', '• Travelers → 2', '• Traveling with kids? → Yes'].join('\n'));
  });
});
