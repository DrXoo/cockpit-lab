// Adjustments in a design history (CONTEXT.md): a part that hangs from another gets a travel
// along an axis of the face it hangs from, and moves along it to fit the driver. Each is stored
// with the operation that attaches its part, so changing one adds no step. Lengths are in mm.
import { faceAxis, type Axis } from './assembly.ts';
import {
  changeOperation,
  lengthAxisOf,
  makesAProfile,
  operationMaking,
  type Adjustment,
  type AdjustableOperation,
  type Operation,
} from './history.ts';
import { withinTravel } from './travel.ts';

/** A new adjustment's travel, as far as a plate usually slides in its slots. */
export const NEW_TRAVEL_MM = 100;

/**
 * Gives a part an adjustment centered where it is attached: along the way it faces for a
 * peripheral, and along its parent otherwise. Refused where the travel would take it off its
 * parent, and for a span, a foot or an anchored part.
 */
export function addAdjustment(history: readonly Operation[], partId: string): Operation[] {
  const operation = adjustableStep(history, partId);
  if (operation.adjustment !== undefined)
    throw new Error(`${operation.name} has an adjustment already.`);
  const adjustment: Adjustment = {
    axis: newAxis(history, operation),
    travelMm: NEW_TRAVEL_MM,
    positionMm: 0,
  };
  return changeOperation(history, { ...operation, adjustment });
}

/**
 * Changes a part's adjustment: its axis, its travel, or where the part is along it. A shorter
 * travel brings the part within it, unless a new position comes with it.
 */
export function editAdjustment(
  history: readonly Operation[],
  partId: string,
  changes: Partial<Adjustment>,
): Operation[] {
  const operation = adjustableStep(history, partId);
  const current = operation.adjustment;
  if (current === undefined) throw new Error(`${operation.name} has no adjustment to change.`);
  const travelMm = changes.travelMm ?? current.travelMm;
  const adjustment: Adjustment = {
    axis: changes.axis ?? current.axis,
    travelMm,
    positionMm: changes.positionMm ?? withinTravel(current.positionMm, travelMm),
  };
  return changeOperation(history, { ...operation, adjustment });
}

/** Takes a part's adjustment away, leaving it at the center of the travel it had. */
export function removeAdjustment(history: readonly Operation[], partId: string): Operation[] {
  const { adjustment: _removed, ...operation } = adjustableStep(history, partId);
  return changeOperation(history, operation);
}

/** The step that attaches a part that can have an adjustment. */
function adjustableStep(history: readonly Operation[], partId: string): AdjustableOperation {
  const operation = operationMaking(history, partId);
  if (!operation) throw new Error(`Part ${partId} is not in the design history.`);
  if (operation.kind === 'add-foot')
    throw new Error(`${operation.name} is a foot, fastened by its own adapter: it does not slide.`);
  if (operation.kind === 'add-anchored-profile')
    throw new Error(`${operation.name} is anchored: only a part that hangs from another slides.`);
  return operation;
}

/** The axis a new adjustment runs along. */
function newAxis(history: readonly Operation[], operation: AdjustableOperation): Axis {
  const normal = faceAxis(operation.face);
  if (operation.kind === 'mount-peripheral') return faceAxis(operation.facing);
  const parent = operationMaking(history, operation.parentId);
  const along =
    parent && makesAProfile(parent)
      ? lengthAxisOf(parent)
      : parent?.kind === 'add-plate'
        ? parent.depthAxis
        : normal;
  if (along !== normal) return along;
  return normal === 'x' ? 'z' : 'x';
}
