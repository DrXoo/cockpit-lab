// The handles that change a profile by dragging in the view (docs/cockpit-editor-interactions.md):
// where they are, and the values of its operation that a drag gives. A drag moves one end of the
// profile along its length, or both ends with Shift on an anchored profile; the length lands on
// steps of 10 mm unless the drag is free. Lengths are in mm, positions in cockpit coordinates.
import { tiltedFromPivot, type Axis, type Vec3Mm } from './assembly.ts';
import {
  makesAProfile,
  MAX_PROFILE_LENGTH_MM,
  MIN_PROFILE_LENGTH_MM,
  operationMaking,
  replayDesign,
  type Operation,
  type ParentEnd,
  type ProfileOperation,
  type ProfileValues,
} from './history.ts';
import type { RayMm } from './picking.ts';

/** A handle at an end of a profile, dragged along its length. */
export interface EndHandle {
  /** The part and the end, as `part-1:end`. */
  id: string;
  partId: string;
  end: ParentEnd;
  /** The center of the end's face. */
  pointMm: Vec3Mm;
  /** One mm out of the end, along the profile. */
  outwardMm: Vec3Mm;
}

/** How a drag resizes a profile: how far the dragged end moves out, each end if symmetric. */
export interface Resize {
  end: ParentEnd;
  symmetric: boolean;
  changeMm: number;
}

/** What the box beside a dragged handle shows: the change of one end, or the whole length. */
export interface ResizeReadout {
  kind: 'change' | 'length';
  valueMm: number;
}

/** A drag lands on lengths that are a whole number of these, unless it is free. */
const LENGTH_STEP_MM = 10;
/** A free drag, or a typed value, lands on whole millimetres, as profiles are cut. */
const FREE_STEP_MM = 1;
const ORIGIN: Vec3Mm = { x: 0, y: 0, z: 0 };

/**
 * The end handles of a part at step `at`: both ends of an anchored profile, only the free end
 * of one grown out of a face, and none for a span, whose length is the gap it meets, or for a
 * part that is not a profile.
 */
export function endHandles(
  history: readonly Operation[],
  partId: string,
  at: number = history.length,
): EndHandle[] {
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

/** Only an anchored profile resizes symmetrically: the other holds one end on its parent. */
const asItCan = (operation: ProfileOperation, resize: Resize): Resize => ({
  ...resize,
  symmetric: resize.symmetric && operation.kind === 'add-anchored-profile',
});
const endsMoved = (resize: Resize) => (resize.symmetric ? 2 : 1);

/** The values of the profile's operation once resized: its length, and its start if it moved. */
export function resizedValues(
  operation: ProfileOperation,
  requested: Resize,
): Partial<ProfileValues> {
  const resize = asItCan(operation, requested);
  const lengthMm = operation.lengthMm + endsMoved(resize) * resize.changeMm;
  const startMoves = resize.symmetric || resize.end === 'start';
  if (operation.kind !== 'add-anchored-profile' || !startMoves) return { lengthMm };
  const startMm = { ...operation.startMm };
  startMm[operation.axis] -= resize.changeMm;
  return { lengthMm, startMm };
}

/**
 * The resize a drag lands on: a length in steps of 10 mm, or of 1 mm when free, within the
 * lengths a profile can have.
 */
export function snappedResize(
  operation: ProfileOperation,
  requested: Resize,
  free: boolean,
): Resize {
  const resize = asItCan(operation, requested);
  const ends = endsMoved(resize);
  const step = free ? FREE_STEP_MM : LENGTH_STEP_MM;
  const draggedLengthMm = operation.lengthMm + ends * resize.changeMm;
  const lengthMm = Math.min(
    Math.max(Math.round(draggedLengthMm / step) * step, MIN_PROFILE_LENGTH_MM),
    MAX_PROFILE_LENGTH_MM,
  );
  return { ...resize, changeMm: (lengthMm - operation.lengthMm) / ends };
}

/** What the box shows for a resize: the change of the dragged end, or the whole length. */
export function resizeReadout(operation: ProfileOperation, requested: Resize): ResizeReadout {
  const resize = asItCan(operation, requested);
  return resize.symmetric
    ? { kind: 'length', valueMm: operation.lengthMm + 2 * resize.changeMm }
    : { kind: 'change', valueMm: resize.changeMm };
}

/** The resize a value typed in the box gives, as `resizeReadout` shows it, to the millimetre. */
export function resizeFromTyped(
  operation: ProfileOperation,
  requested: Resize,
  valueMm: number,
): Resize {
  const resize = asItCan(operation, requested);
  const changeMm = resize.symmetric ? (valueMm - operation.lengthMm) / 2 : valueMm;
  return snappedResize(operation, { ...resize, changeMm }, true);
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
export const handlesSeenAlong = (
  handles: readonly EndHandle[],
  sightAxis: Axis | null,
): EndHandle[] =>
  sightAxis === null
    ? [...handles]
    : handles.filter(({ outwardMm }) => Math.abs(outwardMm[sightAxis]) < SIGHTED_TOLERANCE);
