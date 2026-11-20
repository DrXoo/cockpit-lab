// Putting plates on profiles in a design history (docs/adr/0005): a new plate ready to add, a
// plate moved to a face clicked in the view, and the edits of a plate's step. Lengths are in mm.
import { cleanUserText } from '../../../shared/user-text.ts';
import { faceAxis, type Axis, type Face, type Vec3Mm } from '../parts/assembly.ts';
import { adjustmentOnFace } from './travel.ts';
import {
  AXES,
  changeOperation,
  checkedOperation,
  lengthAxisOf,
  makesAProfile,
  MAX_PART_NAME_LENGTH,
  nextIdentifiers,
  operationMaking,
  replayDesign,
  type AddPlate,
  type Operation,
  type ParentEnd,
  type PlateValues,
} from './history.ts';

/** A new plate: a square that a wheel base or a pedal set fits on, from a common sheet. */
const NEW_PLATE = { sheetId: 'aluminium-8', widthMm: 300, depthMm: 300 } as const;

/**
 * A plate ready to rest on a profile, not yet in the history: on the middle of the profile's
 * top, or of its front for an upright, with its depth along the profile.
 */
export function draftPlate(
  history: readonly Operation[],
  parentId: string,
  at: number = history.length,
): AddPlate {
  const parent = replayDesign(history, at).resolved.get(parentId);
  if (!parent) throw new Error(`Part ${parentId} is not in the design at this step.`);
  if (parent.part.kind !== 'profile')
    throw new Error(`A plate rests on a profile, and ${parent.part.name} is not one.`);
  const axis = parent.part.axis;
  return checkedOperation({
    kind: 'add-plate',
    ...nextIdentifiers(history),
    name: `Plate ${at + 1}`,
    ...NEW_PLATE,
    depthAxis: axis,
    parentId,
    face: axis === 'y' ? '+z' : '+y',
    fromEnd: 'start',
    alongMm: Math.round(parent.lengthMm / 2),
    acrossMm: 0,
  });
}

/**
 * The plate moved to a face of its profile, at a point clicked on it: its center is measured
 * from the nearer end, in whole mm, and centered across the face. The point is in the profile's
 * frame.
 */
export function plateAt(
  history: readonly Operation[],
  draft: AddPlate,
  face: Face,
  pointMm: Vec3Mm,
  at: number = history.length,
): AddPlate {
  const parent = replayDesign(history, at).resolved.get(draft.parentId);
  if (!parent || parent.part.kind !== 'profile')
    throw new Error(`${draft.name} has no profile to rest on.`);
  const axis = parent.part.axis;
  const fromStartMm = Math.round(pointMm[axis] - parent.box.min[axis]);
  const lengthMm = Math.round(parent.lengthMm);
  const nearerEnd: ParentEnd = fromStartMm > lengthMm / 2 ? 'end' : 'start';
  const alongMm = nearerEnd === 'start' ? fromStartMm : lengthMm - fromStartMm;
  return editPlateDraft(history, draft, {
    face,
    fromEnd: nearerEnd,
    alongMm: Math.min(Math.max(alongMm, 0), lengthMm),
    acrossMm: 0,
  });
}

/** A plate not yet in the history, with the changes made to it as an edit would make them. */
export function editPlateDraft(
  history: readonly Operation[],
  draft: AddPlate,
  changes: Partial<PlateValues>,
): AddPlate {
  const face = changes.face ?? draft.face;
  const adjustment = adjustmentOnFace(draft.adjustment, face, profileAxisOf(history, draft));
  return checkedOperation({
    ...draft,
    ...changes,
    name: cleanUserText(changes.name, draft.name, MAX_PART_NAME_LENGTH),
    face,
    depthAxis:
      changes.depthAxis ??
      (face === draft.face ? draft.depthAxis : keptDepthAxis(history, draft, face)),
    ...(adjustment === undefined ? {} : { adjustment }),
  });
}

/** The axis the profile a plate rests on runs along; its depth's for a plate without one. */
function profileAxisOf(history: readonly Operation[], plate: AddPlate): Axis {
  const parent = operationMaking(history, plate.parentId);
  return parent && makesAProfile(parent) ? lengthAxisOf(parent) : plate.depthAxis;
}

/** Changes the values of the step that rests a plate on a profile. */
export function editPlate(
  history: readonly Operation[],
  partId: string,
  changes: Partial<PlateValues>,
): Operation[] {
  const operation = operationMaking(history, partId);
  if (!operation) throw new Error(`Part ${partId} is not in the design history.`);
  if (operation.kind !== 'add-plate') throw new Error(`${operation.name} is not a plate.`);
  return changeOperation(history, editPlateDraft(history, operation, changes));
}

/**
 * The way a plate's depth runs once it moves to `face`: along the profile if it did, otherwise
 * across the new face. On an end face, which the plate cannot rest on, any axis of that face.
 */
function keptDepthAxis(history: readonly Operation[], plate: AddPlate, face: Face): Axis {
  const parent = operationMaking(history, plate.parentId);
  const normal = faceAxis(face);
  const profileAxis = parent && makesAProfile(parent) ? lengthAxisOf(parent) : null;
  const kept =
    profileAxis === null || plate.depthAxis === profileAxis
      ? plate.depthAxis
      : (AXES.find((axis) => axis !== profileAxis && axis !== normal) ?? plate.depthAxis);
  return kept === normal ? (AXES.find((axis) => axis !== normal) ?? kept) : kept;
}
