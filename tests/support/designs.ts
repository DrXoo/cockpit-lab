// Design histories built through the history's public operations, so each is a design the
// editor could make. A span is not built here: it is a grown profile edited with
// `editProfile(history, partId, { reachesId })`, once the part it reaches exists.
import {
  addAnchoredProfile,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
  type Operation,
  type PeripheralValues,
  type PlateValues,
  type ProfileValues,
} from '../../src/cockpit/cad/history/history.ts';
import { draftPeripheral, editPeripheralDraft } from '../../src/cockpit/cad/history/peripherals.ts';
import { draftPlate, editPlateDraft } from '../../src/cockpit/cad/history/plates.ts';

/** `count` anchored 40 × 40 profiles with the values the editor gives them: part-1 onwards. */
export function anchoredProfiles(count: number): Operation[] {
  let history: Operation[] = [];
  for (let added = 0; added < count; added++) history = addAnchoredProfile(history).history;
  return history;
}

/** A 40 × 40 rail named Rail, 1000 mm long, running along z from the origin: part-1. */
export function railHistory(): Operation[] {
  const { history, partId } = addAnchoredProfile([]);
  return editProfile(history, partId, { name: 'Rail', lengthMm: 1000 });
}

/** The rail with a 300 × 300 × 8 mm plate on the middle of its top: part-2. */
export function plateHistory(): Operation[] {
  return withPlate(railHistory(), 'part-1');
}

/** The history with a profile grown out of `parentId`, changed as given before it is added. */
export function withGrowth(
  history: readonly Operation[],
  parentId: string,
  changes: Partial<ProfileValues> = {},
): Operation[] {
  return addOperation(history, editDraft(history, draftGrowth(history, parentId), changes));
}

/** The history with a plate on `parentId`, changed as given before it is added. */
export function withPlate(
  history: readonly Operation[],
  parentId: string,
  changes: Partial<PlateValues> = {},
): Operation[] {
  return addOperation(history, editPlateDraft(history, draftPlate(history, parentId), changes));
}

/** The history with a peripheral of `typeId` mounted on `parentId`, changed as given. */
export function withPeripheral(
  history: readonly Operation[],
  parentId: string,
  typeId: string,
  changes: Partial<PeripheralValues> = {},
): Operation[] {
  const draft = draftPeripheral(history, parentId, typeId);
  return addOperation(history, editPeripheralDraft(history, draft, changes));
}

/**
 * Rail A (part-1), 1000 mm long; rail C (part-2), 500 mm to its left; and B (part-3), grown out
 * of A's left side towards C, free at its own length.
 */
export function growthTowardsRail(): Operation[] {
  let history = anchoredProfiles(2);
  history = editProfile(history, 'part-1', { name: 'A', lengthMm: 1000 });
  history = editProfile(history, 'part-2', { name: 'C', startMm: { x: 500, y: 20, z: 0 } });
  return withGrowth(history, 'part-1', { name: 'B', face: '+x', alongMm: 250 });
}
