// The driver a cockpit design is made for (CONTEXT.md: Driver). Only the stature is stored: the
// posture follows from where the design puts the seat, the wheel and the pedals. Lengths in mm.
import { postureFrom, type SidePoint } from './anatomy.ts';
import { MM_PER_CM } from '../../../shared/units.ts';
import { faceAxis, type ResolvedPart, type Vec3Mm } from '../parts/assembly.ts';
import { cadContacts } from './posture.ts';

export interface Driver {
  statureMm: number;
}

/** A driver of average stature, as the plan sets it for a new design. */
export const DEFAULT_DRIVER: Driver = { statureMm: 1750 };

/** The adult statures the average proportions of the posture model are used for. */
export const MIN_STATURE_MM = 1400;
export const MAX_STATURE_MM = 2100;

/** The driver with this stature; throws a user-facing message outside the statures it takes. */
export function driverOfStature(statureMm: number): Driver {
  if (!Number.isFinite(statureMm) || statureMm < MIN_STATURE_MM || statureMm > MAX_STATURE_MM)
    throw new Error(
      `A driver's stature is from ${MIN_STATURE_MM / 10} to ${MAX_STATURE_MM / 10} cm.`,
    );
  return { statureMm };
}

/** A joint whose angle the driver's comfort depends on. */
export type DriverJoint = 'knee' | 'hip' | 'elbow';

export interface AngleRange {
  minDeg: number;
  maxDeg: number;
}

/** Estimated comfortable ranges for GT driving (docs/mini-cad.md, stage 5). */
export const GT_ANGLE_RANGES: Record<DriverJoint, AngleRange> = {
  knee: { minDeg: 110, maxDeg: 140 },
  hip: { minDeg: 95, maxDeg: 120 },
  elbow: { minDeg: 90, maxDeg: 130 },
};

export interface DriverAngle {
  joint: DriverJoint;
  angleDeg: number;
  range: AngleRange;
  verdict: 'below' | 'within' | 'above';
}

/** The driver drawn as a figure of points on the seat's center plane, in mm. */
export interface DriverFigure {
  hip: Vec3Mm;
  knee: Vec3Mm;
  heel: Vec3Mm;
  shoulder: Vec3Mm;
  eye: Vec3Mm;
  /** The arms that hold something, none when nothing takes the hands. */
  arms: DriverArm[];
}

/** An arm of the figure, from its shoulder through the elbow to the hand. */
export interface DriverArm {
  shoulder: Vec3Mm;
  elbow: Vec3Mm;
  hand: Vec3Mm;
}

export type SeatedDriver =
  | {
      kind: 'seated';
      figure: DriverFigure;
      angles: DriverAngle[];
      /** Whether the legs reach the pedals and the arms the wheel; arms null without one. */
      reach: { legs: boolean; arms: boolean | null };
    }
  | { kind: 'unseated'; reason: string };

/**
 * The driver seated in a design, from the contact points where its parts are: the hip on the
 * seat, the heels on the pedals and the hands on the wheel, with the torso along the backrest.
 * The posture is worked out in the plane through the hip along the way the seat faces, with
 * the average proportions of `anatomy.ts`; a contact off that plane is taken onto it.
 */
export function seatedDriver(
  resolved: ReadonlyMap<string, ResolvedPart>,
  driver: Driver,
): SeatedDriver {
  const found = cadContacts(resolved);
  if ('reason' in found) return { kind: 'unseated', reason: found.reason };
  const { hip, heel, hands, reclineDeg, facing } = found.contacts;
  const forward = faceAxis(facing);
  if (forward === 'y')
    return { kind: 'unseated', reason: 'The seat faces up or down, so no driver sits in it.' };
  const sign = facing[0] === '+' ? 1 : -1;
  const toSide = (point: Vec3Mm): SidePoint => ({
    z: (sign * (point[forward] - hip[forward])) / MM_PER_CM,
    y: point.y / MM_PER_CM,
  });
  const fromSide = (point: SidePoint): Vec3Mm => {
    const onPlane = { ...hip, y: point.y * MM_PER_CM };
    onPlane[forward] = hip[forward] + sign * point.z * MM_PER_CM;
    return onPlane;
  };
  const posture = postureFrom(
    { heightCm: driver.statureMm / MM_PER_CM, reclineDeg },
    { hip: toSide(hip), heel: toSide(heel), ...(hands ? { hands: toSide(hands) } : {}) },
  );
  const arms = posture.hands?.arms ?? null;
  const angles: DriverAngle[] = [
    measured('knee', posture.legs.angle),
    measured('hip', posture.hipAngle),
    ...(arms ? [measured('elbow', arms.angle)] : []),
  ];
  return {
    kind: 'seated',
    figure: {
      hip: fromSide(posture.hip),
      knee: fromSide(posture.legs.joint),
      heel: fromSide(posture.foot),
      shoulder: fromSide(posture.shoulder),
      eye: fromSide(posture.eye),
      arms:
        arms && posture.hands
          ? [
              {
                shoulder: fromSide(posture.shoulder),
                elbow: fromSide(arms.joint),
                hand: fromSide(posture.hands.point),
              },
            ]
          : [],
    },
    angles,
    reach: { legs: posture.legs.reachable, arms: arms ? arms.reachable : null },
  };
}

function measured(joint: DriverJoint, angleDeg: number): DriverAngle {
  const range = GT_ANGLE_RANGES[joint];
  const verdict = angleDeg < range.minDeg ? 'below' : angleDeg > range.maxDeg ? 'above' : 'within';
  return { joint, angleDeg, range, verdict };
}
