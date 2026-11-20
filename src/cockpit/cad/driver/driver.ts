// The driver a cockpit design is made for (CONTEXT.md: Driver). Only the stature is stored: the
// posture follows from where the design puts the seat, the wheel and the pedals. Lengths in mm.
import {
  FOREARM_PER_STATURE,
  postureFrom,
  UPPER_ARM_PER_STATURE,
  type SidePoint,
} from './anatomy.ts';
import { MM_PER_CM } from '../../../shared/units.ts';
import { faceAxis, type Hand, type ResolvedPart, type Vec3Mm } from '../parts/assembly.ts';
import type { DriverArm } from './arms.ts';
import { handsOnGrips, type DoubledGrips, type GripReach } from './grips.ts';
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
  /** The arm of an elbow on a grip; none for the joints both sides share, and on the wheel. */
  hand?: Hand;
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

export type { DriverArm, DoubledGrips, GripReach };

export type SeatedDriver =
  | {
      kind: 'seated';
      figure: DriverFigure;
      angles: DriverAngle[];
      reach: {
        legs: boolean;
        /** Whether the arms reach the wheel; null without one. */
        arms: boolean | null;
        /** Each grip of the design, in the order of its parts. */
        grips: GripReach[];
      };
      /** The hands with more than one stick or throttle, which hold none of them. */
      doubledGrips: DoubledGrips[];
    }
  | { kind: 'unseated'; reason: string };

/**
 * The driver seated in a design, from the contact points where its parts are: the hip on the
 * seat, the heels on the pedals and the hands on the wheel or their grips, with the torso
 * along the backrest. The posture is worked out in the plane through the hip along the way the
 * seat faces, with the average proportions of `anatomy.ts`; a contact off that plane is taken
 * onto it. A hand on a grip reaches it from its own shoulder, beside that plane (`grips.ts`).
 */
export function seatedDriver(
  resolved: ReadonlyMap<string, ResolvedPart>,
  driver: Driver,
): SeatedDriver {
  const found = cadContacts(resolved);
  if ('reason' in found) return { kind: 'unseated', reason: found.reason };
  const { hip, heel, hands, reclineDeg, facing, grips } = found.contacts;
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
  const shoulder = fromSide(posture.shoulder);
  const wheelArm = posture.hands?.arms ?? null;
  const onGrips = handsOnGrips(grips, {
    centerShoulder: shoulder,
    facing,
    statureMm: driver.statureMm,
    arm: {
      upperArmMm: driver.statureMm * UPPER_ARM_PER_STATURE,
      forearmMm: driver.statureMm * FOREARM_PER_STATURE,
    },
    wheelOn: hands !== null,
  });
  const angles: DriverAngle[] = [
    measured('knee', posture.legs.angle),
    measured('hip', posture.hipAngle),
    ...(wheelArm ? [measured('elbow', wheelArm.angle)] : []),
    ...onGrips.held.map(({ hand, elbowDeg }) => ({ ...measured('elbow', elbowDeg), hand })),
  ];
  const wheelArms: DriverArm[] =
    wheelArm && posture.hands
      ? [{ shoulder, elbow: fromSide(wheelArm.joint), hand: fromSide(posture.hands.point) }]
      : [];
  return {
    kind: 'seated',
    figure: {
      hip: fromSide(posture.hip),
      knee: fromSide(posture.legs.joint),
      heel: fromSide(posture.foot),
      shoulder,
      eye: fromSide(posture.eye),
      arms: [...wheelArms, ...onGrips.held.map(({ arm }) => arm)],
    },
    angles,
    reach: {
      legs: posture.legs.reachable,
      arms: wheelArm ? wheelArm.reachable : null,
      grips: onGrips.reach,
    },
    doubledGrips: onGrips.doubled,
  };
}

function measured(joint: DriverJoint, angleDeg: number): DriverAngle {
  const range = GT_ANGLE_RANGES[joint];
  const verdict = angleDeg < range.minDeg ? 'below' : angleDeg > range.maxDeg ? 'above' : 'within';
  return { joint, angleDeg, range, verdict };
}
