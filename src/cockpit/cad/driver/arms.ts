// An arm from a shoulder to a point the hand holds or reaches for, in 3D and in mm, for the
// grips beside the driver, which the side plane of `anatomy.ts` cannot hold.
import type { Vec3Mm } from '../parts/assembly.ts';
import { clamp } from '../../../shared/geometry.ts';
import { dot, minus, norm, plus, scaled } from './vectors.ts';

/** Below this, in mm, a direction has no length to normalize. */
const DEGENERATE_MM = 1e-6;

/** An arm, from its shoulder through the elbow to the hand. */
export interface DriverArm {
  shoulder: Vec3Mm;
  elbow: Vec3Mm;
  hand: Vec3Mm;
}

export interface ArmSegments {
  upperArmMm: number;
  forearmMm: number;
}

export interface ArmPose {
  elbow: Vec3Mm;
  /** The included angle at the elbow, 180° for a straight arm. */
  elbowDeg: number;
  /** How far the hand's point is beyond the stretched arm; 0 when the hand reaches it. */
  shortByMm: number;
}

/**
 * The arm from `shoulder` to `hand`, its elbow bent downwards, or towards `outward` when the hand
 * is straight above or below the shoulder. Beyond its reach the arm is drawn stretched towards
 * the hand, which stays on its point.
 */
export function armTo(
  shoulder: Vec3Mm,
  hand: Vec3Mm,
  { upperArmMm, forearmMm }: ArmSegments,
  outward: Vec3Mm,
): ArmPose {
  const toHand = minus(hand, shoulder);
  const distanceMm = norm(toHand);
  const stretchedMm = upperArmMm + forearmMm;
  const solvedMm = clamp(
    distanceMm,
    Math.abs(upperArmMm - forearmMm) + DEGENERATE_MM,
    stretchedMm - DEGENERATE_MM,
  );
  const along = distanceMm > DEGENERATE_MM ? scaled(toHand, 1 / distanceMm) : { x: 0, y: 0, z: 1 };
  const bend = perpendicularPart({ x: 0, y: -1, z: 0 }, along) ?? perpendicularPart(outward, along);
  const shoulderRad = lawOfCosines(upperArmMm, solvedMm, forearmMm);
  const elbow = plus(
    shoulder,
    plus(
      scaled(along, upperArmMm * Math.cos(shoulderRad)),
      scaled(bend ?? { x: 0, y: 0, z: 0 }, upperArmMm * Math.sin(shoulderRad)),
    ),
  );
  const elbowDeg = (lawOfCosines(upperArmMm, forearmMm, solvedMm) * 180) / Math.PI;
  return { elbow, elbowDeg, shortByMm: Math.max(0, distanceMm - stretchedMm) };
}

/** The angle between sides `a` and `b` of a triangle whose third side is `opposite`. */
function lawOfCosines(a: number, b: number, opposite: number): number {
  return Math.acos(clamp((a * a + b * b - opposite * opposite) / (2 * a * b), -1, 1));
}

/** The unit part of `direction` square to the unit `axis`, or null when it runs along it. */
function perpendicularPart(direction: Vec3Mm, axis: Vec3Mm): Vec3Mm | null {
  const across = minus(direction, scaled(axis, dot(direction, axis)));
  const length = norm(across);
  return length > DEGENERATE_MM ? scaled(across, 1 / length) : null;
}
