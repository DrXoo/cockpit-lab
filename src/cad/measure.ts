// Measuring a cockpit design between two points clicked on its parts: the gap between two faces
// that face each other, or else the X, Y and Z offsets from the first point to the second.
// Measurements belong to the session and are never saved (docs/mini-cad-log.md, stage 2, slice 7).
// Clicked points are in their part's frame, as picking gives them; results are in cockpit mm.
import {
  faceAxis,
  oppositeFace,
  tiltedFromPivot,
  type Axis,
  type BoxMm,
  type Face,
  type ResolvedPart,
  type Vec3Mm,
} from './assembly.ts';
import type { PartHit } from './picking.ts';

export interface GapMeasurement {
  kind: 'gap';
  gapMm: number;
  /** Straight across the gap, from the first face to the second, in cockpit coordinates. */
  fromMm: Vec3Mm;
  toMm: Vec3Mm;
}

export interface OffsetsMeasurement {
  kind: 'offsets';
  /** From the first point to the second, along each cockpit axis. */
  offsetMm: Vec3Mm;
  fromMm: Vec3Mm;
  toMm: Vec3Mm;
}

export type Measurement = GapMeasurement | OffsetsMeasurement;

const AXES: readonly Axis[] = ['x', 'y', 'z'];
const ORIGIN: Vec3Mm = { x: 0, y: 0, z: 0 };

/** The clicks of a measurement so far: a click on a part adds a point, a third starts again. */
export function nextMeasurePicks(picks: readonly PartHit[], hit: PartHit | null): PartHit[] {
  if (hit === null) return [...picks];
  if (picks.length >= 2) return [hit];
  return [...picks, hit];
}

/** What two clicked points measure: the gap between their faces if they face each other. */
export function measureBetween(
  resolved: ReadonlyMap<string, ResolvedPart>,
  first: PartHit,
  second: PartHit,
): Measurement {
  const firstPart = partOf(resolved, first);
  const secondPart = partOf(resolved, second);
  const gap = gapBetween(firstPart, first, secondPart, second);
  if (gap !== null) return gap;
  const fromMm = inCockpit(first.pointMm, firstPart.tiltDeg);
  const toMm = inCockpit(second.pointMm, secondPart.tiltDeg);
  const offsetMm = { x: toMm.x - fromMm.x, y: toMm.y - fromMm.y, z: toMm.z - fromMm.z };
  return { kind: 'offsets', offsetMm, fromMm, toMm };
}

/** The point of a clicked part in cockpit coordinates. */
export function pickInCockpit(resolved: ReadonlyMap<string, ResolvedPart>, hit: PartHit): Vec3Mm {
  return inCockpit(hit.pointMm, partOf(resolved, hit).tiltDeg);
}

function partOf(resolved: ReadonlyMap<string, ResolvedPart>, hit: PartHit): ResolvedPart {
  const part = resolved.get(hit.partId);
  if (!part) throw new Error(`Part ${hit.partId} is not in the design shown.`);
  return part;
}

const inCockpit = (pointMm: Vec3Mm, tiltDeg: number): Vec3Mm =>
  tiltedFromPivot(ORIGIN, pointMm, tiltDeg);

/**
 * The gap between two faces, when they are parallel, look towards each other and overlap
 * across: measured straight across, from the first clicked point moved into the overlap.
 */
function gapBetween(
  firstPart: ResolvedPart,
  first: PartHit,
  secondPart: ResolvedPart,
  second: PartHit,
): GapMeasurement | null {
  const normal = faceAxis(first.face);
  if (firstPart.tiltDeg !== secondPart.tiltDeg || second.face !== oppositeFace(first.face))
    return null;
  const sign = first.face[0] === '+' ? 1 : -1;
  const firstPlaneMm = facePlaneMm(firstPart.box, first.face);
  const secondPlaneMm = facePlaneMm(secondPart.box, second.face);
  const gapMm = (secondPlaneMm - firstPlaneMm) * sign;
  if (gapMm < 0) return null;
  const from = { ...first.pointMm, [normal]: firstPlaneMm };
  for (const axis of AXES) {
    if (axis === normal) continue;
    const low = Math.max(firstPart.box.min[axis], secondPart.box.min[axis]);
    const high = Math.min(firstPart.box.max[axis], secondPart.box.max[axis]);
    if (low > high) return null;
    from[axis] = Math.min(Math.max(from[axis], low), high);
  }
  const to = { ...from, [normal]: secondPlaneMm };
  const { tiltDeg } = firstPart;
  return { kind: 'gap', gapMm, fromMm: inCockpit(from, tiltDeg), toMm: inCockpit(to, tiltDeg) };
}

/** Where a face of a box lies along its normal axis. */
const facePlaneMm = (box: BoxMm, face: Face): number =>
  face[0] === '+' ? box.max[faceAxis(face)] : box.min[faceAxis(face)];
