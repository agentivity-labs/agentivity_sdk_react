import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

/**
 * The calendar of Agentivity — the same as `AgCalendar` in the Flutter SDK: a month at a time, the weeks from Monday, today
 * ringed, the day chosen filled in the primary colour (a period: its two ends filled and the days between tinted), the days
 * outside the window greyed. The name of the month opens the twelve months, to go far quickly; a few shortcuts (today,
 * tomorrow, next week…) choose in one tap. Inline in a card or a form, or in a popover ({@link DateField}).
 *
 * Dates are ISO days (`2026-11-07`), never times: what a person chooses is a day.
 */
export interface CalendarProps {
  /** The day chosen (one day). */
  value?: string;
  /** A period instead of a day: its first day, then its last. */
  rangeMode?: boolean;
  rangeStart?: string;
  rangeEnd?: string;
  /** The first and last days that may be chosen (ISO); none: no bound. */
  min?: string;
  max?: string;
  onChange?: (day: string) => void;
  /** A period chosen: its end is undefined until the second day is. */
  onRangeChange?: (start: string, end: string | undefined) => void;
  /** Today, tomorrow, next week… above the days (default true). */
  shortcuts?: boolean;
  disabled?: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PRIMARY = 'var(--ag-primary, #2563eb)';
const ON_PRIMARY = 'var(--ag-on-primary, #ffffff)';
const OUTLINE = 'var(--ag-outline-variant, #e2e8f0)';
const HOVER = 'var(--ag-surface-container-highest, #e2e8f0)';
const SURFACE = 'var(--ag-surface-container-low, #f8fafc)';

/** A day as an ISO date, from its local parts. */
export function isoDate(d: Date): string {
  return `${d.getFullYear().toString().padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** An ISO day as a local date (midnight), or undefined. */
export function parseIsoDate(iso: string | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

/** A day said shortly: "Sat 7 Nov 2026". */
export function dateText(iso: string): string {
  const d = parseIsoDate(iso);
  return d ? `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` : iso;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function Calendar({ value, rangeMode = false, rangeStart, rangeEnd, min, max, onChange, onRangeChange, shortcuts = true, disabled = false }: CalendarProps) {
  const first = parseIsoDate(min);
  const last = parseIsoDate(max);
  const allowed = (d: Date) => (!first || d >= first) && (!last || d <= last);
  const shown = parseIsoDate(rangeMode ? rangeStart : value);
  const [month, setMonth] = useState(() => {
    const at = shown ?? (first && today() < first ? first : last && today() > last ? last : today());
    return new Date(at.getFullYear(), at.getMonth(), 1);
  });
  const [months, setMonths] = useState(false);
  const [hovered, setHovered] = useState<string | undefined>();

  function go(n: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + n, 1);
    if (n < 0 && first && new Date(next.getFullYear(), next.getMonth() + 1, 0) < first) return;
    if (n > 0 && last && next > last) return;
    setMonth(next);
  }

  function choose(d: Date) {
    if (disabled || !allowed(d)) return;
    const iso = isoDate(d);
    if (!rangeMode) {
      onChange?.(iso);
      return;
    }
    // A first day, or a new period once one is whole: it starts here. Otherwise the second day ends it, either way round.
    if (!rangeStart || rangeEnd) onRangeChange?.(iso, undefined);
    else if (iso < rangeStart) onRangeChange?.(iso, rangeStart);
    else onRangeChange?.(rangeStart, iso);
  }

  const quick = useMemo(() => {
    const t = today();
    if (rangeMode) {
      const monday = addDays(t, -((t.getDay() + 6) % 7));
      return [
        { label: 'This week', start: monday, end: addDays(monday, 6) },
        { label: 'Next 7 days', start: t, end: addDays(t, 6) },
        { label: 'This month', start: new Date(t.getFullYear(), t.getMonth(), 1), end: new Date(t.getFullYear(), t.getMonth() + 1, 0) },
        { label: 'Next month', start: new Date(t.getFullYear(), t.getMonth() + 1, 1), end: new Date(t.getFullYear(), t.getMonth() + 2, 0) },
      ];
    }
    return [
      { label: 'Today', start: t, end: t },
      { label: 'Tomorrow', start: addDays(t, 1), end: addDays(t, 1) },
      { label: 'Next Monday', start: addDays(t, 8 - (t.getDay() === 0 ? 7 : t.getDay())), end: addDays(t, 8 - (t.getDay() === 0 ? 7 : t.getDay())) },
      { label: 'In a month', start: new Date(t.getFullYear(), t.getMonth() + 1, t.getDate()), end: new Date(t.getFullYear(), t.getMonth() + 1, t.getDate()) },
    ];
  }, [rangeMode]).filter((q) => allowed(q.start) && allowed(q.end));

  const lead = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const todayIso = isoDate(today());
  // While the last day of a period is not chosen, the period follows the pointer.
  const end = rangeStart ? rangeEnd ?? hovered ?? rangeStart : undefined;
  const lo = rangeStart && end ? (end < rangeStart ? end : rangeStart) : undefined;
  const hi = rangeStart && end ? (end < rangeStart ? rangeStart : end) : undefined;

  const arrow = (label: string, glyph: string, n: number) => (
    <button type="button" aria-label={label} title={label} onClick={() => go(n)} style={arrowStyle}>
      {glyph}
    </button>
  );

  return (
    <div className="ag-calendar" style={{ width: '100%', maxWidth: 400, minWidth: 252, userSelect: 'none' }}>
      {shortcuts && quick.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {quick.map((q) => {
            const s = isoDate(q.start);
            const e = isoDate(q.end);
            const selected = rangeMode ? s === rangeStart && e === rangeEnd : s === value;
            return (
              <button
                key={q.label}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (rangeMode) onRangeChange?.(s, e);
                  else onChange?.(s);
                  setMonth(new Date(q.start.getFullYear(), q.start.getMonth(), 1));
                }}
                style={{
                  ...chipStyle,
                  borderColor: selected ? PRIMARY : OUTLINE,
                  color: selected ? PRIMARY : 'inherit',
                  background: selected ? 'color-mix(in srgb, var(--ag-primary, #2563eb) 14%, transparent)' : 'transparent',
                }}
              >
                {q.label}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <button type="button" aria-expanded={months} onClick={() => setMonths(!months)} style={headerStyle}>
          <span style={{ fontWeight: 700 }}>{MONTHS[month.getMonth()]}</span>
          <span style={{ opacity: 0.65 }}>{month.getFullYear()}</span>
          <span aria-hidden="true" style={{ opacity: 0.6, fontSize: 11 }}>{months ? '▲' : '▼'}</span>
        </button>
        <span style={{ flex: 1 }} />
        {arrow(months ? 'Previous year' : 'Previous month', '‹', months ? -12 : -1)}
        {arrow(months ? 'Next year' : 'Next month', '›', months ? 12 : 1)}
      </div>
      {months ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {MONTHS_SHORT.map((label, m) => {
            const enabled = !(first && new Date(month.getFullYear(), m + 1, 0) < first) && !(last && new Date(month.getFullYear(), m, 1) > last);
            return (
              <DayCell
                key={label}
                label={label}
                height={40}
                selected={m === month.getMonth()}
                today={todayIso.slice(0, 7) === `${month.getFullYear()}-${String(m + 1).padStart(2, '0')}`}
                enabled={enabled}
                onClick={() => {
                  setMonth(new Date(month.getFullYear(), m, 1));
                  setMonths(false);
                }}
              />
            );
          })}
        </div>
      ) : (
        <div role="grid" aria-label={`${MONTHS[month.getMonth()]} ${month.getFullYear()}`} onMouseLeave={() => setHovered(undefined)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, opacity: 0.6, padding: '6px 0', letterSpacing: 0.3 }}>
                {w}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {Array.from({ length: lead }, (_, i) => (
              <div key={`lead-${i}`} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
              const iso = isoDate(d);
              const isEnd = rangeMode ? iso === lo || iso === hi : iso === value;
              const inside = rangeMode && lo && hi && iso > lo && iso < hi;
              const band = rangeMode && lo && hi && lo !== hi && (inside || isEnd);
              return (
                <div
                  key={iso}
                  onMouseEnter={() => rangeMode && setHovered(iso)}
                  style={{
                    position: 'relative',
                    padding: 3,
                    background: band
                      ? `linear-gradient(to right, ${iso === lo ? 'transparent 50%, ' : ''}color-mix(in srgb, var(--ag-primary, #2563eb) 12%, transparent) ${iso === lo ? '50%' : '0'}${iso === hi ? ', color-mix(in srgb, var(--ag-primary, #2563eb) 12%, transparent) 50%, transparent 50%' : ''})`
                      : undefined,
                    backgroundClip: 'content-box',
                  }}
                >
                  <DayCell
                    label={String(i + 1)}
                    height={38}
                    selected={isEnd}
                    today={iso === todayIso}
                    enabled={!disabled && allowed(d)}
                    weekend={d.getDay() === 0 || d.getDay() === 6}
                    onClick={() => choose(d)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DayCell({ label, height, selected, today: isToday, enabled, weekend = false, onClick }: { label: string; height: number; selected: boolean; today: boolean; enabled: boolean; weekend?: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      disabled={!enabled}
      aria-pressed={selected}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        height,
        border: isToday && !selected ? `1.5px solid ${PRIMARY}` : '1.5px solid transparent',
        borderRadius: 10,
        background: selected ? PRIMARY : hover && enabled ? HOVER : 'transparent',
        color: selected ? ON_PRIMARY : 'inherit',
        opacity: enabled ? (weekend && !selected ? 0.75 : 1) : 0.28,
        fontSize: 14,
        fontWeight: selected || isToday ? 700 : 500,
        cursor: enabled ? 'pointer' : 'default',
        font: 'inherit',
        fontFamily: 'inherit',
        transition: 'background 120ms ease',
        position: 'relative',
      }}
    >
      {label}
    </button>
  );
}

const arrowStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  border: 'none',
  background: 'color-mix(in srgb, var(--ag-surface-container-highest, #e2e8f0) 60%, transparent)',
  color: 'inherit',
  fontSize: 20,
  lineHeight: '30px',
  cursor: 'pointer',
};

const headerStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  fontSize: 15,
  padding: '4px 6px',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const chipStyle: CSSProperties = {
  padding: '5px 10px',
  borderRadius: 999,
  border: `1px solid ${OUTLINE}`,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export interface DateFieldProps {
  value?: string;
  onChange: (day: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Its accessible name, when no label says it. */
  ariaLabel?: string;
}

/**
 * A field of a form that holds a day: what is chosen (or the placeholder) and a calendar icon; a click opens the calendar
 * under it, a tap on a day chooses it and closes it. Escape or a click outside closes it.
 */
export function DateField({ value, onChange, placeholder = 'Choose a date', min, max, disabled = false, ariaLabel }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={box} onKeyDown={onKey} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? (value ? dateText(value) : placeholder)}
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          minHeight: 40,
          boxSizing: 'border-box',
          padding: '8px 12px',
          borderRadius: 10,
          border: `${value ? 1.5 : 1}px solid ${value ? PRIMARY : OUTLINE}`,
          background: SURFACE,
          color: 'inherit',
          fontSize: 14,
          fontFamily: 'inherit',
          textAlign: 'left',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span aria-hidden="true" className="material-icons" style={{ fontSize: 18, color: value ? PRIMARY : 'inherit', opacity: value ? 1 : 0.6 }}>
          calendar_month
        </span>
        <span style={{ flex: 1, opacity: value ? 1 : 0.6 }}>{value ? dateText(value) : placeholder}</span>
        <span aria-hidden="true" style={{ opacity: 0.5, fontSize: 11 }}>▼</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={placeholder}
          style={{
            position: 'absolute',
            zIndex: 50,
            top: 'calc(100% + 6px)',
            left: 0,
            width: 320,
            maxWidth: 'calc(100vw - 32px)',
            boxSizing: 'border-box',
            padding: 14,
            borderRadius: 16,
            border: `1px solid ${OUTLINE}`,
            background: 'var(--ag-surface, #ffffff)',
            color: 'inherit',
            boxShadow: '0 12px 32px rgba(16, 26, 46, 0.18)',
          }}
        >
          <Calendar
            value={value}
            min={min}
            max={max}
            onChange={(day) => {
              onChange(day);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
