// The handles that change a part by dragging in the view (docs/cockpit-editor-interactions.md):
// where they are, and the history a drag gives. Every handle changes the values of the operation
// that made its part along one direction, as the inspector would. Handles sit where the part is
// drawn, as fitted; a drag changes a value, so it does not matter where along its travel. Lengths are in mm, positions
// in cockpit coordinates.
import {
  faceAxis,
  tiltedFromPivot,
  type Axis,
  type BoxMm,
  type Face,
  type ResolvedPart,
  type Vec3Mm,
} from '../parts/assembly.ts';
import {
  AXES,
  editFoot,
  editProfile,
  isAdjustable,
  lengthAxisOf,
  makesAProfile,
  MAX_PLATE_SIDE_MM,
  MAX_PROFILE_LENGTH_MM,
  MIN_PLATE_SIDE_MM,
  MIN_PROFILE_LENGTH_MM,
  operationMaking,
  replayDesign,
  type AddPlate,
  type FootValues,
  type MakingOperation,
  type Operation,
  type ParentEnd,
  type PlateValues,
  type ProfileOperation,
  type ProfileValues,
} from '../history/history.ts';
import type { RayMm } from './picking.ts';
import { editPlate } from '../history/plates.ts';
import { editPeripheral } from '../history/peripherals.ts';
import { editAdjustment } from '../history/adjustments.ts';
import { withinTravel } from '../history/travel.ts';

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

/** A handle at the middle of an edge of a plate, dragged across it to change that side. */
export interface EdgeHandle {
  kind: 'edge';
  /** The part and the side of the plate the edge is on, as `part-2:edge:+x`. */
  id: string;
  partId: string;
  side: Face;
  /** The middle of the edge, halfway through the plate's thickness. */
  pointMm: Vec3Mm;
  /** One mm out of the edge, across it. */
  outwardMm: Vec3Mm;
}

/**
 * A handle at the center of a part with an adjustment, dragged along its travel to fit the
 * driver: it moves the part without changing it, within the ends of the travel.
 */
export interface TravelHandle {
  kind: 'travel';
  /** The part, as `part-2:travel`. */
  id: string;
  partId: string;
  axis: Axis;
  /** The center of the part, where it is along its travel. */
  pointMm: Vec3Mm;
  /** One mm towards + on the axis, in the part's frame. */
  outwardMm: Vec3Mm;
  /**
   * The center of its travel and its ends, on the face the part hangs from, below the part's
   * center where it is along it.
   */
  travel: { centerMm: Vec3Mm; fromMm: Vec3Mm; toMm: Vec3Mm };
}

/** A control on the selected part, dragged along `outwardMm` from `pointMm`. */
export type Handle = EndHandle | MoveHandle | EdgeHandle | TravelHandle;

/**
 * How far a handle was dragged out along its direction, whether Shift made it symmetric, and the
 * part a dragged end reaches, which makes its profile a span.
 */
export interface Drag {
  changeMm: number;
  symmetric: boolean;
  reachesId?: string;
}

/**
 * How a handle is being dragged: whether Shift is held, which moves both ends or only one, and
 * Alt, which drops the steps and the snapping; a snap reaches `snapWithinMm` along the handle, as far
 * as a few pixels on screen cover where it is.
 */
export interface HandleModifiers {
  shiftHeld: boolean;
  free: boolean;
  snapWithinMm: number;
}

/**
 * What the box beside a dragged handle shows: the change of one end or edge, the whole length,
 * width or depth of a symmetric resize, how far the part moved, or the length of a span an end
 * makes by reaching a part.
 */
export interface DragReadout {
  kind: 'change' | 'length' | 'width' | 'depth' | 'move' | 'reach' | 'position';
  valueMm: number;
}

/** A size an end or edge handle changes, and the sizes it can take. */
interface Sizing {
  kind: 'length' | 'width' | 'depth';
  sizeMm: number;
  minMm: number;
  maxMm: number;
  /** Whether both ends can move at once, keeping the middle where it is. */
  symmetric: boolean;
}

/** A drag lands on values that are a whole number of these, unless it is free. */
const DRAG_STEP_MM = 10;
/** A free drag, or a typed value, lands on whole millimetres, as profiles are cut. */
const FREE_STEP_MM = 1;
const ORIGIN: Vec3Mm = { x: 0, y: 0, z: 0 };

/** The handles of a part at step `at`: its end or edge handles, then its move handles. */
export function partHandles(
  history: readonly Operation[],
  partId: string,
  at: number = history.length,
): Handle[] {
  const operation = operationMaking(history, partId);
  const resolved = replayDesign(history, at).fitted.resolved.get(partId);
  if (!operation || !resolved) return [];
  return [
    ...endHandles(operation, resolved),
    ...edgeHandles(operation, resolved),
    ...moveHandles(history, operation, resolved),
  ];
}

/** The arrow along the travel of a part, at step `at`; none for a part that does not slide. */
export function travelHandles(
  history: readonly Operation[],
  partId: string,
  at: number = history.length,
): TravelHandle[] {
  const operation = operationMaking(history, partId);
  const adjustment = adjustmentOf(history, partId);
  const resolved = replayDesign(history, at).fitted.resolved.get(partId);
  if (!operation || !isAdjustable(operation) || !adjustment || !resolved) return [];
  const { axis, travelMm, positionMm } = adjustment;
  const { box, tiltDeg } = resolved;
  const pointInFrame = centerOf(box);
  // The travel runs where the part meets its parent, as rails and slots do, clear of the arrow.
  const onFace = { ...pointInFrame };
  const normal = faceAxis(operation.face);
  onFace[normal] = operation.face[0] === '+' ? box.min[normal] : box.max[normal];
  const alongTravel = (offsetMm: number) => {
    const point = { ...onFace };
    point[axis] += offsetMm - positionMm;
    return outOfFrame(point, tiltDeg);
  };
  return [
    {
      kind: 'travel',
      id: `${partId}:travel`,
      partId,
      axis,
      pointMm: outOfFrame(pointInFrame, tiltDeg),
      outwardMm: outOfFrame(unitAlong(axis), tiltDeg),
      travel: {
        centerMm: alongTravel(0),
        fromMm: alongTravel(-travelMm / 2),
        toMm: alongTravel(travelMm / 2),
      },
    },
  ];
}

/** The adjustment of the part a handle moves, if it has one. */
function adjustmentOf(history: readonly Operation[], partId: string) {
  const operation = operationMaking(history, partId);
  return operation && isAdjustable(operation) ? operation.adjustment : undefined;
}

/** Where a travel handle's part is along its travel before the drag. */
function travelPosition(history: readonly Operation[], handle: TravelHandle) {
  const adjustment = adjustmentOf(history, handle.partId);
  if (!adjustment) throw new Error(`Part ${handle.partId} has no travel to move along.`);
  return adjustment;
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
  if (handle.kind === 'travel') {
    const { positionMm } = travelPosition(history, handle);
    return editAdjustment(history, handle.partId, { positionMm: positionMm + drag.changeMm });
  }
  if (handle.kind === 'move') {
    const operation = makingOperation(history, handle);
    return editPart(history, operation, movedValues(history, operation, handle, drag.changeMm));
  }
  const sized = asItCan(sizingOf(history, handle), drag);
  if (handle.kind === 'edge') {
    const plate = plateMaking(history, handle);
    return editPlate(history, handle.partId, resizedPlateValues(history, plate, handle, sized));
  }
  const operation = profileMaking(history, handle);
  if (drag.reachesId !== undefined)
    return editProfile(history, handle.partId, { reachesId: drag.reachesId });
  return editProfile(history, handle.partId, resizedValues(operation, handle, sized));
}

/**
 * Whether a drag moves both ends or edges at once. A plate is placed by its center, so its edges
 * move together unless Shift holds the far one; a profile is lengthened from the end dragged,
 * and Shift moves both of its ends.
 */
export const symmetricDrag = (handle: Handle, shiftHeld: boolean): boolean =>
  handle.kind === 'edge' ? !shiftHeld : shiftHeld;

/**
 * The handle where a drag leaves it: moved as far along its direction as the drag went, as the
 * end, edge or part it changes did. It stays even where the part then has no such handle, as a
 * span has no end handle.
 */
export function draggedHandle<Dragged extends Handle>(handle: Dragged, drag: Drag): Dragged {
  const { pointMm, outwardMm } = handle;
  const { changeMm } = drag;
  return {
    ...handle,
    pointMm: {
      x: pointMm.x + outwardMm.x * changeMm,
      y: pointMm.y + outwardMm.y * changeMm,
      z: pointMm.z + outwardMm.z * changeMm,
    },
  };
}

/**
 * The drag a pointer lands on: a value in steps of 10 mm, or of 1 mm when free; a size within
 * those the part can have.
 */
export function snappedDrag(
  history: readonly Operation[],
  handle: Handle,
  requested: Drag,
  free: boolean,
): Drag {
  const step = free ? FREE_STEP_MM : DRAG_STEP_MM;
  if (handle.kind === 'travel') {
    const { positionMm, travelMm } = travelPosition(history, handle);
    const steppedMm = Math.round((positionMm + requested.changeMm) / step) * step;
    return { changeMm: withinTravel(steppedMm, travelMm) - positionMm, symmetric: false };
  }
  if (handle.kind === 'move') {
    const operation = makingOperation(history, handle);
    const { valueMm, sign } = positionMoved(history, operation, handle);
    const movedMm = Math.round((valueMm + sign * requested.changeMm) / step) * step;
    return { changeMm: (movedMm - valueMm) * sign, symmetric: false };
  }
  const sizing = sizingOf(history, handle);
  const drag = asItCan(sizing, requested);
  const ends = endsMoved(drag);
  const draggedMm = sizing.sizeMm + ends * drag.changeMm;
  const sizeMm = Math.min(
    Math.max(Math.round(draggedMm / step) * step, sizing.minMm),
    sizing.maxMm,
  );
  return { ...drag, changeMm: (sizeMm - sizing.sizeMm) / ends };
}

/**
 * What the box shows for a drag: how far the part moved, the change of the dragged end or edge,
 * or the whole size of a symmetric resize.
 */
export function dragReadout(
  history: readonly Operation[],
  handle: Handle,
  requested: Drag,
): DragReadout {
  if (handle.kind === 'move') return { kind: 'move', valueMm: requested.changeMm };
  if (handle.kind === 'travel')
    return {
      kind: 'position',
      valueMm: travelPosition(history, handle).positionMm + requested.changeMm,
    };
  const sizing = sizingOf(history, handle);
  if (requested.reachesId !== undefined)
    return { kind: 'reach', valueMm: sizing.sizeMm + requested.changeMm };
  const drag = asItCan(sizing, requested);
  return drag.symmetric
    ? { kind: sizing.kind, valueMm: sizing.sizeMm + 2 * drag.changeMm }
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
  if (handle.kind === 'travel') {
    const { positionMm } = travelPosition(history, handle);
    return snappedDrag(history, handle, { changeMm: valueMm - positionMm, symmetric: false }, true);
  }
  const sizing = sizingOf(history, handle);
  const drag = asItCan(sizing, requested);
  const changeMm = drag.symmetric ? (valueMm - sizing.sizeMm) / 2 : valueMm;
  return snappedDrag(history, handle, { ...drag, changeMm }, true);
}

/** The size an end or edge handle changes. */
function sizingOf(history: readonly Operation[], handle: EndHandle | EdgeHandle): Sizing {
  if (handle.kind === 'edge') return plateSizing(plateMaking(history, handle), handle);
  const operation = profileMaking(history, handle);
  return {
    kind: 'length',
    sizeMm: operation.lengthMm,
    minMm: MIN_PROFILE_LENGTH_MM,
    maxMm: MAX_PROFILE_LENGTH_MM,
    // A profile grown out of a face holds one end on it.
    symmetric: operation.kind === 'add-anchored-profile',
  };
}

/** A drag as the size allows it: symmetric only where both ends can move, reaching no part. */
const asItCan = (sizing: Sizing, drag: Drag): Drag => ({
  changeMm: drag.changeMm,
  symmetric: drag.symmetric && sizing.symmetric,
});
const endsMoved = (drag: Drag) => (drag.symmetric ? 2 : 1);

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

/** The operation that made the plate a handle resizes. */
function plateMaking(history: readonly Operation[], handle: Handle): AddPlate {
  const operation = makingOperation(history, handle);
  if (operation.kind !== 'add-plate')
    throw new Error(`${operation.name} is not a plate: it has no edges.`);
  return operation;
}

/** Edits a part's operation with the editor the inspector uses for its kind. */
function editPart(
  history: readonly Operation[],
  operation: MakingOperation,
  values: Partial<ProfileValues & FootValues & PlateValues>,
): Operation[] {
  switch (operation.kind) {
    case 'add-foot':
      return editFoot(history, operation.partId, values);
    case 'add-plate':
      return editPlate(history, operation.partId, values);
    case 'mount-peripheral':
      return editPeripheral(history, operation.partId, values);
    case 'add-anchored-profile':
    case 'grow-profile':
      return editProfile(history, operation.partId, values);
  }
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

/**
 * The values of the profile's operation once resized, by a drag its sizing allows: its length,
 * and its start if it moved.
 */
function resizedValues(
  operation: ProfileOperation,
  handle: EndHandle,
  drag: Drag,
): Partial<ProfileValues> {
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

/** The axes of its frame a part moves along: first the one its place is measured along. */
function movingAxes(history: readonly Operation[], operation: MakingOperation): Axis[] {
  if (operation.kind === 'add-anchored-profile') return [...AXES];
  const along = parentAlongAxis(history, operation);
  const normal = operation.kind === 'add-foot' ? 'y' : faceAxis(operation.face);
  if (along === null || along === normal) return [];
  if (operation.kind === 'add-foot') return [along];
  const across = AXES.filter((axis) => axis !== normal && axis !== along);
  return [along, ...across];
}

/**
 * The axis a hanging part's place is measured along: the length of a profile it hangs from, or
 * the depth of a plate a peripheral is mounted on. Null for any other parent.
 */
function parentAlongAxis(
  history: readonly Operation[],
  operation: Exclude<MakingOperation, { kind: 'add-anchored-profile' }>,
): Axis | null {
  const parent = operationMaking(history, operation.parentId);
  if (parent && makesAProfile(parent)) return lengthAxisOf(parent);
  return parent?.kind === 'add-plate' ? parent.depthAxis : null;
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
  if (handle.axis === parentAlongAxis(history, operation))
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
  return handle.axis === parentAlongAxis(history, operation)
    ? { alongMm: movedMm }
    : { acrossMm: movedMm };
}

// Edge handles: resizing a plate.

/**
 * The edge handles of a plate, one at the middle of each edge, across the axes of the face it
 * rests on; none for another part.
 */
function edgeHandles(operation: MakingOperation, resolved: ResolvedPart): EdgeHandle[] {
  if (operation.kind !== 'add-plate') return [];
  const { box, tiltDeg } = resolved;
  const normal = faceAxis(operation.face);
  return AXES.filter((axis) => axis !== normal).flatMap((axis) =>
    ([-1, 1] as const).map((sign): EdgeHandle => {
      const side: Face = `${sign < 0 ? '-' : '+'}${axis}`;
      const edgeInFrame = centerOf(box);
      edgeInFrame[axis] = sign < 0 ? box.min[axis] : box.max[axis];
      return {
        kind: 'edge',
        id: `${operation.partId}:edge:${side}`,
        partId: operation.partId,
        side,
        pointMm: outOfFrame(edgeInFrame, tiltDeg),
        outwardMm: outOfFrame(unitAlong(axis, sign), tiltDeg),
      };
    }),
  );
}

/** The side of a plate an edge handle changes: its depth, or its width. */
function plateSizing(plate: AddPlate, handle: EdgeHandle): Sizing {
  const alongDepth = faceAxis(handle.side) === plate.depthAxis;
  return {
    kind: alongDepth ? 'depth' : 'width',
    sizeMm: alongDepth ? plate.depthMm : plate.widthMm,
    minMm: MIN_PLATE_SIDE_MM,
    maxMm: MAX_PLATE_SIDE_MM,
    symmetric: true,
  };
}

/**
 * The values of a plate's operation once an edge is dragged: the side across it, and its center,
 * which moves half as far so that the far edge stays; a symmetric drag keeps the center.
 */
function resizedPlateValues(
  history: readonly Operation[],
  plate: AddPlate,
  handle: EdgeHandle,
  drag: Drag,
): Partial<PlateValues> {
  const sizing = plateSizing(plate, handle);
  const sideMm = sizing.sizeMm + endsMoved(drag) * drag.changeMm;
  const side = sizing.kind === 'depth' ? { depthMm: sideMm } : { widthMm: sideMm };
  if (drag.symmetric) return side;
  const axis = faceAxis(handle.side);
  const shiftMm = ((handle.side[0] === '+' ? 1 : -1) * drag.changeMm) / 2;
  if (axis !== parentAlongAxis(history, plate))
    return { ...side, acrossMm: plate.acrossMm + shiftMm };
  const alongShiftMm = plate.fromEnd === 'start' ? shiftMm : -shiftMm;
  return { ...side, alongMm: plate.alongMm + alongShiftMm };
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
