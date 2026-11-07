import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Calendar, DateField, dateText } from '../src/artifacts/components/interaction/Calendar.js';

describe('Calendar', () => {
  it('chooses a day with a tap, and never one outside its window', () => {
    const onChange = vi.fn();
    render(<Calendar value="2030-03-10" min="2030-03-05" max="2030-03-31" shortcuts={false} onChange={onChange} />);

    expect(screen.getByText('March')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '18' }));
    expect(onChange).toHaveBeenCalledWith('2030-03-18');
  });

  it('chooses a period: its first day, then its last, either way round; a whole period starts again', () => {
    const seen: Array<[string, string | undefined]> = [];
    function Host() {
      const [range, setRange] = useState<[string | undefined, string | undefined]>([undefined, undefined]);
      return (
        <Calendar
          rangeMode
          rangeStart={range[0]}
          rangeEnd={range[1]}
          min="2030-03-01"
          max="2030-03-31"
          shortcuts={false}
          onRangeChange={(s, e) => {
            seen.push([s, e]);
            setRange([s, e]);
          }}
        />
      );
    }
    render(<Host />);

    fireEvent.click(screen.getByRole('button', { name: '20' }));
    fireEvent.click(screen.getByRole('button', { name: '12' }));
    fireEvent.click(screen.getByRole('button', { name: '25' }));
    expect(seen).toEqual([
      ['2030-03-20', undefined],
      ['2030-03-12', '2030-03-20'],
      ['2030-03-25', undefined],
    ]);
  });

  it('opens the twelve months from the name of the month', () => {
    const onChange = vi.fn();
    render(<Calendar value="2031-01-10" shortcuts={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /January/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sep' }));
    fireEvent.click(screen.getByRole('button', { name: '30' }));
    expect(onChange).toHaveBeenCalledWith('2031-09-30');
  });
});

describe('DateField', () => {
  it('opens the calendar under it, and closes it once a day is chosen', () => {
    function Host() {
      const [day, setDay] = useState<string | undefined>('2032-05-04');
      return <DateField value={day} onChange={setDay} />;
    }
    render(<Host />);

    fireEvent.click(screen.getByRole('button', { name: dateText('2032-05-04') }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '21' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: dateText('2032-05-21') })).toBeTruthy();
  });
});
