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
import type { MountingPattern } from '../../src/cockpit/cad/parts/mounting-pattern.ts';
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

/**
 * Two 40 × 40 rails 1000 mm long along z, standing on the floor either side of X 0 with their
 * centers `apartMm` apart, by default as far as the generic seat's holes: Left rail (part-1)
 * towards +X, the driver's left, and Right rail (part-2).
 */
export function seatRails(apartMm = 360): Operation[] {
  let history = anchoredProfiles(2);
  history = editProfile(history, 'part-1', {
    name: 'Left rail',
    lengthMm: 1000,
    startMm: { x: apartMm / 2, y: 20, z: 0 },
  });
  return editProfile(history, 'part-2', {
    name: 'Right rail',
    lengthMm: 1000,
    startMm: { x: -apartMm / 2, y: 20, z: 0 },
  });
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
 * The mounting pattern of the reference case in docs/mini-cad.md: four 6.5 mm holes 120 × 80 mm
 * apart. A test case, not a manufacturer's pattern.
 */
export const REFERENCE_PATTERN: MountingPattern = {
  holes: [
    { xMm: -60, yMm: -40, diameterMm: 6.5 },
    { xMm: 60, yMm: -40, diameterMm: 6.5 },
    { xMm: 60, yMm: 40, diameterMm: 6.5 },
    { xMm: -60, yMm: 40, diameterMm: 6.5 },
  ],
};

/**
 * The rail with the reference plate of docs/mini-cad.md, 200 × 150 × 5 mm and named Reference
 * plate, on the middle of its top (part-2), changed as given.
 */
export function referencePlate(changes: Partial<PlateValues> = {}): Operation[] {
  return withPlate(railHistory(), 'part-1', {
    name: 'Reference plate',
    widthMm: 200,
    depthMm: 150,
    sheetId: 'aluminium-5',
    ...changes,
  });
}

/** The reference plate on `face` of the rail, with a Wheel base at its center on the reference pattern (part-3). */
export function referenceWheelBase(face: '+y' | '-y' = '+y'): Operation[] {
  return withPeripheral(referencePlate({ face }), 'part-2', 'generic-wheel-base', {
    name: 'Wheel base',
    face,
    mountingPattern: REFERENCE_PATTERN,
  });
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

/**
 * The rail (part-1) with a Deck grown out of its top (part-2), a plate on the deck (part-3) and
 * a wheel base on the plate (part-4).
 */
export function deckHistory(): Operation[] {
  const deck = withGrowth(railHistory(), 'part-1', { name: 'Deck', face: '+y', alongMm: 500 });
  const plated = withPlate(deck, 'part-2', { name: 'Wheel plate', face: '+z' });
  return withPeripheral(plated, 'part-3', 'generic-wheel-base', { face: '+z' });
}
