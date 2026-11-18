// A part about to be added (a profile about to grow, a plate about to rest on a profile, or a
// peripheral about to be mounted) is an operation that is not in the design history yet. The view shows it at the history marker, and
// its handles and the inspector's edits change it there, as they change a part already added.
import {
  operationMaking,
  type AddPlate,
  type GrowProfile,
  type MountPeripheral,
  type Operation,
} from './operations.ts';

/** A part about to be added, previewed in the view. */
export type Draft = GrowProfile | AddPlate | MountPeripheral;

/** The history the view shows while a part is about to be added: the draft at the marker. */
export function withDraft(history: readonly Operation[], draft: Draft, at: number): Operation[] {
  return [...history.slice(0, at), draft, ...history.slice(at)];
}

/**
 * The draft as an edit of the history that shows it leaves it. Throws when the edit is refused,
 * as it would be for a part already added.
 */
export function draftEditedBy(
  history: readonly Operation[],
  draft: Draft,
  at: number,
  edit: (shown: Operation[]) => Operation[],
): Draft {
  const edited = operationMaking(edit(withDraft(history, draft, at)), draft.partId);
  if (edited?.kind !== draft.kind)
    throw new Error(`${draft.name} is no longer the part about to be added.`);
  return edited;
}
