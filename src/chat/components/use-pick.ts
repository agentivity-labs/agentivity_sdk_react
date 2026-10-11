import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * Selecting an element of a graph that can also be dragged: a press that does not move is a selection, one that moves is a
 * drag of the drawing. The press is noted on the element and judged on the root when it is released, because a graph that
 * pans captures the pointer on its root (so a plain `click` on the element never comes).
 *
 * `target(id)` goes on each selectable element, `root` on the svg. Without `onPick` both are empty: the graph stays a picture.
 */
export function usePick(onPick: ((id: string) => void) | undefined) {
  const press = useRef<{ id: string; x: number; y: number } | null>(null);
  if (!onPick) return { target: (_id: string) => ({}), root: {} };
  return {
    target: (id: string) => ({
      role: 'button' as const,
      tabIndex: 0,
      onPointerDown: (e: PointerEvent) => {
        press.current = { id, x: e.clientX, y: e.clientY };
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPick(id);
      },
    }),
    root: {
      onPointerUp: (e: PointerEvent) => {
        const pressed = press.current;
        press.current = null;
        if (pressed && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 5) onPick(pressed.id);
      },
      onPointerCancel: () => {
        press.current = null;
      },
    },
  };
}
