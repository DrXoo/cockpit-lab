// The handles that change a part by dragging in the view (docs/cockpit-editor-interactions.md):
// where they are, and the history a drag gives. Every handle changes the values of the operation
// that made its part along one direction, as the inspector would. Lengths are in mm, positions
// in cockpit coordinates.
import { tiltedFromPivot, type Axis, type Vec3Mm } from './assembly.ts';
import {
  editProfile,
  makesAProfile,
  MAX_PROFILE_LENGTH_MM,
  MIN_PROFILE_LENGTH_MM,
  operationMaking,
  replayDesign,
  type MakingOperation,
  type Operation,
  type ParentEnd,
  type ProfileOperation,
  type ProfileValues,
} from './history.ts';
import type { RayMm } from './picking.ts';

/** A handle at an end of a profile, dragged along its length. */
export interface EndHandle {
  kind: 'end';
  /** The part and the end, as `part-1:end`. */
  id: string;
  partId: string;
  end: ParentEnd;
  /** The center of the end's face. */
  pointMm: Vec3Mm;
  /** One mm out of the end, along the profile. */
  outwardMm: Vec3Mm;
}

/** A control on the selected part, dragged along `outwardMm` from `pointMm`. */
export type Handle = EndHandle;

/** How far a handle was dragged out along its direction, and whether Shift made it symmetric. */
export interface Drag {
  changeMm: number;
  symmetric: boolean;
}

/** What the box beside a dragged handle shows: the change of one end, or the whole length. */
export interface DragReadout {
  kind: 'change' | 'length';
  valueMm: number;
}

/** A drag lands on lengths that are a whole number of these, unless it is free. */
const LENGTH_STEP_MM = 10;
/** A free drag, or a typed value, lands on whole millimetres, as profiles are cut. */
const FREE_STEP_MM = 1;
const ORIGIN: Vec3Mm = { x: 0, y: 0, z: 0 };

/** The handles of a part at step `at`. */
export function partHandles(
  history: readonly Operation[],
  partId: string,
  at: number = history.length,
): Handle[] {
  return endHandles(history, partId, at);
}

/**
 * The end handles of a part at step `at`: both ends of an anchored profile, only the free end
 * of one grown out of a face, and none for a span, whose length is the gap it meets, or for a
 * part that is not a profile.
 */
function endHandles(history: readonly Operation[], partId: string, at: number): EndHandle[] {
  const operation = operationMaking(history, partId);
  const resolved = replayDesign(history, at).resolved.get(partId);
  if (!operation || !makesAProfile(operation) || resolved?.part.kind !== 'profile') return [];
  const { box, tiltDeg } = resolved;
  const axis = resolved.part.axis;
  return freeEnds(operation).map((end) => {
    const centerInFrame = {
      x: (box.min.x + box.max.x) / 2,
      y: (box.min.y + box.max.y) / 2,
      z: (box.min.z + box.max.z) / 2,
    };
    centerInFrame[axis] = end === 'start' ? box.min[axis] : box.max[axis];
    const outwardInFrame = { x: 0, y: 0, z: 0 };
    outwardInFrame[axis] = end === 'start' ? -1 : 1;
    return {
      kind: 'end',
      id: `${partId}:${end}`,
      partId,
      end,
      pointMm: tiltedFromPivot(ORIGIN, centerInFrame, tiltDeg),
      outwardMm: tiltedFromPivot(ORIGIN, outwardInFrame, tiltDeg),
    };
  });
}

/** The ends of a profile that are not held by the part it grows out of. */
function freeEnds(operation: ProfileOperation): ParentEnd[] {
  if (operation.kind === 'add-anchored-profile') return ['start', 'end'];
  if (operation.reachesId !== undefined) return [];
  const toward = operation.way === 'out' ? operation.face : operation.way;
  return [toward[0] === '+' ? 'end' : 'start'];
}

/**
 * The history once the handle is dragged: the values of its part's operation changed as the
 * inspector would change them. Throws, as the inspector's edit does, when the operation cannot
 * take them.
 */
export function draggedHistory(
  history: readonly Operation[],
  handle: Handle,
  drag: Drag,
): Operation[] {
  const operation = profileMaking(history, handle);
  return editProfile(history, handle.partId, resizedValues(operation, handle, drag));
}

/**
 * The drag a pointer lands on: a length in steps of 10 mm, or of 1 mm when free, within the
 * lengths a profile can have.
 */
export function snappedDrag(
  history: readonly Operation[],
  handle: Handle,
  requested: Drag,
  free: boolean,
): Drag {
  const operation = profileMaking(history, handle);
  const drag = asItCan(operation, requested);
  const ends = endsMoved(drag);
  const step = free ? FREE_STEP_MM : LENGTH_STEP_MM;
  const draggedLengthMm = operation.lengthMm + ends * drag.changeMm;
  const lengthMm = Math.min(
    Math.max(Math.round(draggedLengthMm / step) * step, MIN_PROFILE_LENGTH_MM),
    MAX_PROFILE_LENGTH_MM,
  );
  return { ...drag, changeMm: (lengthMm - operation.lengthMm) / ends };
}

/** What the box shows for a drag: the change of the dragged end, or the whole length. */
export function dragReadout(
  history: readonly Operation[],
  handle: Handle,
  requested: Drag,
): DragReadout {
  const operation = profileMaking(history, handle);
  const drag = asItCan(operation, requested);
  return drag.symmetric
    ? { kind: 'length', valueMm: operation.lengthMm + 2 * drag.changeMm }
    : { kind: 'change', valueMm: drag.changeMm };
}

/** The drag a value typed in the box gives, as `dragReadout` shows it, to the millimetre. */
export function dragFromTyped(
  history: readonly Operation[],
  handle: Handle,
  requested: Drag,
  valueMm: number,
): Drag {
  const operation = profileMaking(history, handle);
  const drag = asItCan(operation, requested);
  const changeMm = drag.symmetric ? (valueMm - operation.lengthMm) / 2 : valueMm;
  return snappedDrag(history, handle, { ...drag, changeMm }, true);
}

/** The operation that made the profile a handle changes. */
function profileMaking(history: readonly Operation[], handle: Handle): ProfileOperation {
  const operation: MakingOperation | undefined = operationMaking(history, handle.partId);
  if (!operation || !makesAProfile(operation))
    throw new Error(`Part ${handle.partId} is not a profile: no handle resizes it.`);
  return operation;
}

/** Only an anchored profile resizes symmetrically: the other holds one end on its parent. */
const asItCan = (operation: ProfileOperation, drag: Drag): Drag => ({
  ...drag,
  symmetric: drag.symmetric && operation.kind === 'add-anchored-profile',
});
const endsMoved = (drag: Drag) => (drag.symmetric ? 2 : 1);

/** The values of the profile's operation once resized: its length, and its start if it moved. */
function resizedValues(
  operation: ProfileOperation,
  handle: EndHandle,
  requested: Drag,
): Partial<ProfileValues> {
  const drag = asItCan(operation, requested);
  const lengthMm = operation.lengthMm + endsMoved(drag) * drag.changeMm;
  const startMoves = drag.symmetric || handle.end === 'start';
  if (operation.kind !== 'add-anchored-profile' || !startMoves) return { lengthMm };
  const startMm = { ...operation.startMm };
  startMm[operation.axis] -= drag.changeMm;
  return { lengthMm, startMm };
}

/**
 * How far along the axis through `originMm`, in the direction `directionMm`, lies the point
 * nearest to the ray: where the pointer drags a handle. Null when the ray runs along the axis.
 */
export function distanceAlongAxis(
  ray: RayMm,
  originMm: Vec3Mm,
  directionMm: Vec3Mm,
): number | null {
  const axis = unit(directionMm);
  const look = unit(ray.directionMm);
  const between = {
    x: originMm.x - ray.originMm.x,
    y: originMm.y - ray.originMm.y,
    z: originMm.z - ray.originMm.z,
  };
  const alignment = dot(axis, look);
  const denominator = 1 - alignment * alignment;
  if (Math.abs(denominator) < PARALLEL_TOLERANCE) return null;
  return (alignment * dot(look, between) - dot(axis, between)) / denominator;
}

/** Below this, the ray and the axis are taken as parallel: the pointer cannot drag along it. */
const PARALLEL_TOLERANCE = 1e-9;

const dot = (a: Vec3Mm, b: Vec3Mm) => a.x * b.x + a.y * b.y + a.z * b.z;

function unit(vector: Vec3Mm): Vec3Mm {
  const length = Math.sqrt(dot(vector, vector));
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

/** A handle that points along the line of sight cannot be dragged on screen: it is left out. */
const SIGHTED_TOLERANCE = 1e-6;

/** The handles a flat view looking along `sightAxis` can drag; all of them in 3D (null). */
export const handlesSeenAlong = (handles: readonly Handle[], sightAxis: Axis | null): Handle[] =>
  sightAxis === null
    ? [...handles]
    : handles.filter(({ outwardMm }) => Math.abs(outwardMm[sightAxis]) < SIGHTED_TOLERANCE);
