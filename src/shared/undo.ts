// Undo and redo of the edits made while a design is open. They are separate from the design
// history and are not saved (docs/adr/0005): each step is the whole value before an edit.

export interface Edits<T> {
  /** Values before each edit, oldest first. */
  past: readonly T[];
  /** Values undone, the next one to redo last. */
  future: readonly T[];
}

/** Enough to walk back a working session; older steps are dropped. */
export const MAX_UNDO_STEPS = 100;

export const noEdits = <T>(): Edits<T> => ({ past: [], future: [] });

export const canUndo = <T>(edits: Edits<T>): boolean => edits.past.length > 0;

export const canRedo = <T>(edits: Edits<T>): boolean => edits.future.length > 0;

/** Records the value an edit started from; what could be redone is dropped. */
export function recordEdit<T>(edits: Edits<T>, before: T): Edits<T> {
  return { past: [...edits.past, before].slice(-MAX_UNDO_STEPS), future: [] };
}

/** The value before the last edit, or null when there is nothing to undo. */
export function undo<T>(edits: Edits<T>, current: T): { edits: Edits<T>; value: T } | null {
  if (!canUndo(edits)) return null;
  const value = edits.past[edits.past.length - 1];
  return {
    edits: { past: edits.past.slice(0, -1), future: [...edits.future, current] },
    value,
  };
}

/** The value the last undo left, or null when there is nothing to redo. */
export function redo<T>(edits: Edits<T>, current: T): { edits: Edits<T>; value: T } | null {
  if (!canRedo(edits)) return null;
  const value = edits.future[edits.future.length - 1];
  return {
    edits: { past: [...edits.past, current], future: edits.future.slice(0, -1) },
    value,
  };
}
