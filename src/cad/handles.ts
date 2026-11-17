// The handles that change a part by dragging in the view (docs/cockpit-editor-interactions.md):
// where they are, and the history a drag gives. Every handle changes the values of the operation
// that made its part along one direction, as the inspector would. Lengths are in mm, positions
// in cockpit coordinates.
import {
  faceAxis,
  tiltedFromPivot,
  type Axis,
  type BoxMm,
  type ResolvedPart,
  type Vec3Mm,
} from './assembly.ts';
import {
  AXES,
  editFoot,
  editProfile,
  lengthAxisOf,
  makesAProfile,
  MAX_PROFILE_LENGTH_MM,
  MIN_PROFILE_LENGTH_MM,
  operationMaking,
  replayDesign,
  type FootValues,
  type MakingOperation,
  type Operation,
  type ParentEnd,
  type PlateValues,
  type ProfileOperation,
  type ProfileValues,
} from './history.ts';
import type { RayMm } from './picking.ts';
import { editPlate } from './plates.ts';

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

/** A handle at the center of a part, dragged along one axis of its frame to move it. */
export interface MoveHandle {
  kind: 'move';
  /** The part and the axis, as `part-1:move:x`. */
  id: string;
  partId: string;
  axis: Axis;
  /** The center of the part. */
  pointMm: Vec3Mm;
  /** One mm towards + on the axis, in the part's frame. */
  outwardMm: Vec3Mm;
}

/** A control on the selected part, dragged along `outwardMm` from `pointMm`. */
export type Handle = EndHandle | MoveHandle;

/** How far a handle was dragged out along its direction, and whether Shift made it symmetric. */
export interface Drag {
  changeMm: number;
  symmetric: boolean;
}

/**
 * What the box beside a dragged handle shows: the change of one end, the whole length, or how
 * far the part moved.
 */
export interface DragReadout {
  kind: 'change' | 'length' | 'move';
  valueMm: number;
}

/** A drag lands on values that are a whole number of these, unless it is free. */
const DRAG_STEP_MM = 10;
/** A free drag, or a typed value, lands on whole millimetres, as profiles are cut. */
const FREE_STEP_MM = 1;
const ORIGIN: Vec3Mm = { x: 0, y: 0, z: 0 };

/** The handles of a part at step `at`: its end handles, then its move handles. */
export function partHandles(
  history: readonly Operation[],
  partId: string,
  at: number = history.length,
): Handle[] {
  const operation = operationMaking(history, partId);
  const resolved = replayDesign(history, at).resolved.get(partId);
  if (!operation || !resolved) return [];
  return [...endHandles(operation, resolved), ...moveHandles(history, operation, resolved)];
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
  if (handle.kind === 'move') {
    const operation = makingOperation(history, handle);
    return editPart(history, operation, movedValues(history, operation, handle, drag.changeMm));
  }
  const operation = profileMaking(history, handle);
  return editProfile(history, handle.partId, resizedValues(operation, handle, drag));
}

/**
 * The drag a pointer lands on: a value in steps of 10 mm, or of 1 mm when free; a length within
 * those a profile can have.
 */
export function snappedDrag(
  history: readonly Operation[],
  handle: Handle,
  requested: Drag,
  free: boolean,
): Drag {
  const step = free ? FREE_STEP_MM : DRAG_STEP_MM;
  if (handle.kind === 'move') {
    const operation = makingOperation(history, handle);
    const { valueMm, sign } = positionMoved(history, operation, handle);
    const movedMm = Math.round((valueMm + sign * requested.changeMm) / step) * step;
    return { changeMm: (movedMm - valueMm) * sign, symmetric: false };
  }
  const operation = profileMaking(history, handle);
  const drag = asItCan(operation, requested);
  const ends = endsMoved(drag);
  const draggedLengthMm = operation.lengthMm + ends * drag.changeMm;
  const lengthMm = Math.min(
    Math.max(Math.round(draggedLengthMm / step) * step, MIN_PROFILE_LENGTH_MM),
    MAX_PROFILE_LENGTH_MM,
  );
  return { ...drag, changeMm: (lengthMm - operation.lengthMm) / ends };
}

/**
 * What the box shows for a drag: how far the part moved, the change of the dragged end, or the
 * whole length of a symmetric resize.
 */
export function dragReadout(
  history: readonly Operation[],
  handle: Handle,
  requested: Drag,
): DragReadout {
  if (handle.kind === 'move') return { kind: 'move', valueMm: requested.changeMm };
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
  if (handle.kind === 'move') {
    const changeMm = Math.round(valueMm / FREE_STEP_MM) * FREE_STEP_MM;
    return { changeMm, symmetric: false };
  }
  const operation = profileMaking(history, handle);
  const drag = asItCan(operation, requested);
  const changeMm = drag.symmetric ? (valueMm - operation.lengthMm) / 2 : valueMm;
  return snappedDrag(history, handle, { ...drag, changeMm }, true);
}

/** The operation that made the part a handle changes. */
function makingOperation(history: readonly Operation[], handle: Handle): MakingOperation {
  const operation = operationMaking(history, handle.partId);
  if (!operation) throw new Error(`Part ${handle.partId} is not in the design history.`);
  return operation;
}

/** The operation that made the profile a handle resizes. */
function profileMaking(history: readonly Operation[], handle: Handle): ProfileOperation {
  const operation = makingOperation(history, handle);
  if (!makesAProfile(operation))
    throw new Error(`${operation.name} is not a profile: no handle resizes it.`);
  return operation;
}

/** Edits a part's operation with the editor the inspector uses for its kind. */
function editPart(
  history: readonly Operation[],
  operation: MakingOperation,
  values: Partial<ProfileValues & FootValues & PlateValues>,
): Operation[] {
  if (operation.kind === 'add-foot') return editFoot(history, operation.partId, values);
  if (operation.kind === 'add-plate') return editPlate(history, operation.partId, values);
  return editProfile(history, operation.partId, values);
}

/** The cockpit point at `inFrameMm`, in the frame of a part at `tiltDeg`. */
const outOfFrame = (inFrameMm: Vec3Mm, tiltDeg: number) =>
  tiltedFromPivot(ORIGIN, inFrameMm, tiltDeg);

function centerOf(box: BoxMm): Vec3Mm {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}

/** One mm along `axis`, towards + or −. */
function unitAlong(axis: Axis, sign: 1 | -1 = 1): Vec3Mm {
  const vector = { x: 0, y: 0, z: 0 };
  vector[axis] = sign;
  return vector;
}

// End handles: resizing a profile.

/**
 * The end handles of a part: both ends of an anchored profile, only the free end of one grown
 * out of a face, and none for a span, whose length is the gap it meets, or for a part that is
 * not a profile.
 */
function endHandles(operation: MakingOperation, resolved: ResolvedPart): EndHandle[] {
  if (!makesAProfile(operation) || resolved.part.kind !== 'profile') return [];
  const { box, tiltDeg } = resolved;
  const axis = resolved.part.axis;
  return freeEnds(operation).map((end) => {
    const endInFrame = centerOf(box);
    endInFrame[axis] = end === 'start' ? box.min[axis] : box.max[axis];
    return {
      kind: 'end',
      id: `${operation.partId}:${end}`,
      partId: operation.partId,
      end,
      pointMm: outOfFrame(endInFrame, tiltDeg),
      outwardMm: outOfFrame(unitAlong(axis, end === 'start' ? -1 : 1), tiltDeg),
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

// Move handles: placing a part.

/**
 * The move handles of a part, one for each axis it can move along: the three axes for an
 * anchored part; along and across the face it hangs from for one that hangs from a profile,
 * only along for a foot, and none on an end face, which has a single place.
 */
function moveHandles(
  history: readonly Operation[],
  operation: MakingOperation,
  resolved: ResolvedPart,
): MoveHandle[] {
  const { box, tiltDeg } = resolved;
  return movingAxes(history, operation).map((axis) => ({
    kind: 'move',
    id: `${operation.partId}:move:${axis}`,
    partId: operation.partId,
    axis,
    pointMm: outOfFrame(centerOf(box), tiltDeg),
    outwardMm: outOfFrame(unitAlong(axis), tiltDeg),
  }));
}

/** The axes of its frame a part moves along, along its parent's length first. */
function movingAxes(history: readonly Operation[], operation: MakingOperation): Axis[] {
  if (operation.kind === 'add-anchored-profile') return [...AXES];
  const along = parentLengthAxis(history, operation);
  const normal = operation.kind === 'add-foot' ? 'y' : faceAxis(operation.face);
  if (along === null || along === normal) return [];
  if (operation.kind === 'add-foot') return [along];
  const across = AXES.filter((axis) => axis !== normal && axis !== along);
  return [along, ...across];
}

/** The axis the parent of a hanging part runs along, or null if it is not a profile. */
function parentLengthAxis(
  history: readonly Operation[],
  operation: Exclude<MakingOperation, { kind: 'add-anchored-profile' }>,
): Axis | null {
  const parent = operationMaking(history, operation.parentId);
  return parent && makesAProfile(parent) ? lengthAxisOf(parent) : null;
}

/**
 * The value of an operation a move handle changes, and whether it grows (1) or shrinks (−1) as
 * the part moves towards + on the handle's axis.
 */
function positionMoved(
  history: readonly Operation[],
  operation: MakingOperation,
  handle: MoveHandle,
): { valueMm: number; sign: 1 | -1 } {
  if (operation.kind === 'add-anchored-profile')
    return { valueMm: operation.startMm[handle.axis], sign: 1 };
  if (handle.axis === parentLengthAxis(history, operation))
    return { valueMm: operation.alongMm, sign: operation.fromEnd === 'start' ? 1 : -1 };
  if (operation.kind === 'add-foot') throw new Error(`${operation.name} only moves along.`);
  return { valueMm: operation.acrossMm, sign: 1 };
}

/** The values of a part's operation once moved `changeMm` towards + on the handle's axis. */
function movedValues(
  history: readonly Operation[],
  operation: MakingOperation,
  handle: MoveHandle,
  changeMm: number,
): Partial<ProfileValues & FootValues & PlateValues> {
  const { valueMm, sign } = positionMoved(history, operation, handle);
  const movedMm = valueMm + sign * changeMm;
  if (operation.kind === 'add-anchored-profile') {
    const startMm = { ...operation.startMm };
    startMm[handle.axis] = movedMm;
    return { startMm };
  }
  return handle.axis === parentLengthAxis(history, operation)
    ? { alongMm: movedMm }
    : { acrossMm: movedMm };
}

// Dragging with the pointer.

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
