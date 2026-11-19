// Snapping a dragged handle to the parts around it (docs/cockpit-editor-interactions.md): an end
// that reaches the facing face of a part, an end or face flush with a face of another part, and
// a part centered on its parent. The pointer's 10 mm steps, in `handles.ts`, apply only where
// none of these is near. Lengths are in mm; parts are compared in the frame of their tilt.
import {
  faceAxis,
  tiltedFromPivot,
  type Axis,
  type BoxMm,
  type ResolvedPart,
  type Vec3Mm,
} from './assembly.ts';
import {
  dependentsOf,
  facingParts,
  operationMaking,
  replayDesign,
  type Operation,
} from './history.ts';
import { draggedHistory, type Drag, type Handle } from './handles.ts';

/** A dashed line in the view between the two places a snap lines up. */
export interface SnapGuide {
  fromMm: Vec3Mm;
  toMm: Vec3Mm;
}

/** What a dragged handle snapped to, in the order it looks for them. */
export interface Snap {
  kind: 'reach' | 'flush' | 'centered';
  guide: SnapGuide;
}

/** A drag that snapped, and to what. */
export interface SnappedDrag {
  drag: Drag;
  snap: Snap;
}

/** A place a handle could snap to: the drag that takes it there, and its guide. */
interface Candidate {
  drag: Drag;
  snap: Snap;
}

/** The axis of its part's frame a handle drags along, towards + (1) or − (−1). */
interface Direction {
  axis: Axis;
  sign: 1 | -1;
}

const ORIGIN: Vec3Mm = { x: 0, y: 0, z: 0 };

/**
 * The drag a handle snaps to when dragged `requested`, within `withinMm` of a place that lines
 * its part up with others: reaching a part, then flush with one, then centered on its parent.
 * Places the part's operation cannot take are left out. Null when none is near.
 */
export function snapToParts(
  history: readonly Operation[],
  handle: Handle,
  requested: Drag,
  withinMm: number,
  at: number = history.length,
): SnappedDrag | null {
  // A part moves along its travel as on the built cockpit, in steps, lining up with nothing.
  if (handle.kind === 'travel') return null;
  const { resolved } = replayDesign(history, at);
  const part = resolved.get(handle.partId);
  if (!part) return null;
  const direction = directionOf(handle, part);
  const others = othersAt(history, resolved, part);
  const near = (candidates: Candidate[]) =>
    candidates
      .map((candidate) => ({
        candidate,
        offMm: Math.abs(candidate.drag.changeMm - requested.changeMm),
      }))
      .filter(({ offMm }) => offMm <= withinMm)
      .sort((a, b) => a.offMm - b.offMm)
      .map(({ candidate }) => candidate);
  const inOrder = [
    ...near(reaching(history, handle, part, direction, resolved)),
    ...near(flushWith(handle, part, direction, others, requested)),
    ...near(centered(history, handle, part, direction, resolved)),
  ];
  return inOrder.find((candidate) => takes(history, handle, candidate.drag)) ?? null;
}

/** Whether the part's operation can take the drag. */
function takes(history: readonly Operation[], handle: Handle, drag: Drag): boolean {
  try {
    draggedHistory(history, handle, drag);
    return true;
  } catch {
    return false;
  }
}

/** The direction a handle drags its end, edge or part, in the frame of the part's tilt. */
function directionOf(handle: Handle, part: ResolvedPart): Direction {
  if (handle.kind === 'move' || handle.kind === 'travel') return { axis: handle.axis, sign: 1 };
  if (handle.kind === 'edge')
    return { axis: faceAxis(handle.side), sign: handle.side[0] === '+' ? 1 : -1 };
  if (part.part.kind !== 'profile') throw new Error(`${part.part.name} has no ends to drag.`);
  return { axis: part.part.axis, sign: handle.end === 'end' ? 1 : -1 };
}

/**
 * The parts a handle can line up with: those at its part's tilt, leaving out the part and the
 * parts that hang from it or reach it, which move with it.
 */
function othersAt(
  history: readonly Operation[],
  resolved: ReadonlyMap<string, ResolvedPart>,
  part: ResolvedPart,
): ResolvedPart[] {
  const moving = dependentsOf(history, part.part.id);
  return [...resolved.values()].filter(
    (other) => !moving.has(other.part.id) && other.tiltDeg === part.tiltDeg,
  );
}

/**
 * The free end of a profile grown out of a face, at the facing face of each part it can reach,
 * where it makes the profile a span.
 */
function reaching(
  history: readonly Operation[],
  handle: Handle,
  part: ResolvedPart,
  direction: Direction,
  resolved: ReadonlyMap<string, ResolvedPart>,
): Candidate[] {
  if (handle.kind !== 'end') return [];
  return facingParts(history, handle.partId).flatMap((reachesId) => {
    const reached = resolved.get(reachesId);
    if (!reached) return [];
    const faceMm =
      direction.sign > 0 ? reached.box.min[direction.axis] : reached.box.max[direction.axis];
    const changeMm = direction.sign * (faceMm - planeOf(part.box, direction));
    return [
      {
        drag: { changeMm, symmetric: false, reachesId },
        snap: { kind: 'reach', guide: guideAt(part, reached, direction.axis, faceMm) },
      },
    ];
  });
}

/**
 * The places where the dragged end or edge, or either face of a moved part across its axis,
 * lies in the plane of a face of another part.
 */
function flushWith(
  handle: Handle,
  part: ResolvedPart,
  direction: Direction,
  others: readonly ResolvedPart[],
  requested: Drag,
): Candidate[] {
  const { axis, sign } = direction;
  const moving = movingPlanes(handle, part.box, direction);
  return others.flatMap((other) =>
    [other.box.min[axis], other.box.max[axis]].flatMap((planeMm) =>
      moving.map((movingMm) => ({
        drag: { changeMm: sign * (planeMm - movingMm), symmetric: requested.symmetric },
        snap: { kind: 'flush' as const, guide: guideAt(part, other, axis, planeMm) },
      })),
    ),
  );
}

/** A part that hangs from another, with its center at the middle of its parent along the axis. */
function centered(
  history: readonly Operation[],
  handle: Handle,
  part: ResolvedPart,
  direction: Direction,
  resolved: ReadonlyMap<string, ResolvedPart>,
): Candidate[] {
  if (handle.kind !== 'move') return [];
  const operation = operationMaking(history, handle.partId);
  if (!operation || operation.kind === 'add-anchored-profile') return [];
  const parent = resolved.get(operation.parentId);
  if (!parent) return [];
  const { axis } = direction;
  const middleMm = centerOf(parent.box)[axis];
  return [
    {
      drag: { changeMm: middleMm - centerOf(part.box)[axis], symmetric: false },
      snap: { kind: 'centered', guide: guideAt(part, parent, axis, middleMm) },
    },
  ];
}

/** The plane of the end or edge a handle drags, along its axis. */
const planeOf = (box: BoxMm, { axis, sign }: Direction) =>
  sign > 0 ? box.max[axis] : box.min[axis];

/** The planes across its axis that a drag moves: both faces of a moved part, or the dragged end. */
function movingPlanes(handle: Handle, box: BoxMm, direction: Direction): number[] {
  if (handle.kind === 'move') return [box.min[direction.axis], box.max[direction.axis]];
  return [planeOf(box, direction)];
}

/**
 * A guide in the plane at `planeMm` across `axis`, from the middle of the part to the middle of
 * the part it lines up with.
 */
function guideAt(part: ResolvedPart, other: ResolvedPart, axis: Axis, planeMm: number): SnapGuide {
  const from = centerOf(part.box);
  const to = centerOf(other.box);
  from[axis] = planeMm;
  to[axis] = planeMm;
  return {
    fromMm: tiltedFromPivot(ORIGIN, from, part.tiltDeg),
    toMm: tiltedFromPivot(ORIGIN, to, part.tiltDeg),
  };
}

function centerOf(box: BoxMm): Vec3Mm {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}
