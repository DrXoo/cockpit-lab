// How the driver's hands meet the grips of a design (CONTEXT.md: Grip): which ones they hold,
// which ones they only reach for, and whether each is within reach of its shoulder. In mm.
import { faceAxis, HANDS, type Face, type Hand, type Vec3Mm } from '../parts/assembly.ts';
import { armTo, type ArmSegments, type DriverArm } from './arms.ts';
import type { CadGrip } from './posture.ts';
import { plus, scaled } from './vectors.ts';

/** A grip and whether its hand reaches it from the shoulder. */
export interface GripReach {
  partId: string;
  /** The peripheral's name, as the user gave it. */
  name: string;
  hand: Hand;
  /** Whether the hand rests on it; a grip only reached for has just its reach checked. */
  held: boolean;
  /** How far it is beyond the stretched arm; 0 when the hand reaches it. */
  shortByMm: number;
}

/** A hand with more than one stick or throttle, which holds none of them. */
export interface DoubledGrips {
  hand: Hand;
  /** The names of the peripherals, in the order of their parts. */
  names: string[];
}

/** A hand on its grip, and the angle of its elbow. */
export interface HeldGrip {
  hand: Hand;
  arm: DriverArm;
  elbowDeg: number;
}

export interface Torso {
  /** The middle of the shoulders, at the top of the torso. */
  centerShoulder: Vec3Mm;
  /** The way the driver faces, upright. */
  facing: Face;
  statureMm: number;
  arm: ArmSegments;
  /** Whether both hands are on a wheel, so no grip is held. */
  wheelOn: boolean;
}

/**
 * The span from one shoulder joint to the other as a share of the stature: estimated a little
 * inside the shoulder width of average proportions, about 0.26 of the stature, as the joints
 * sit inside the outline of the shoulders.
 */
const SHOULDER_SPAN_PER_STATURE = 0.2;

/**
 * How the hands meet the grips: without a wheel, each hand holds its one stick or throttle,
 * held in the order of `HANDS`; every grip has its reach checked from its hand's shoulder.
 */
export function handsOnGrips(
  grips: readonly CadGrip[],
  torso: Torso,
): { held: HeldGrip[]; reach: GripReach[]; doubled: DoubledGrips[] } {
  const doubled = doubledGrips(grips);
  const heldGrips = torso.wheelOn
    ? []
    : HANDS.flatMap((hand) => {
        const restingOn = restingGrips(grips, hand);
        return restingOn.length === 1 ? restingOn : [];
      });
  const held: HeldGrip[] = [];
  const reach = grips.map((grip): GripReach => {
    const { shoulder, outward } = shoulderOf(grip.hand, torso);
    const pose = armTo(shoulder, grip.pointMm, torso.arm, outward);
    const isHeld = heldGrips.includes(grip);
    if (isHeld) {
      const arm = { shoulder, elbow: pose.elbow, hand: grip.pointMm };
      held.push({ hand: grip.hand, arm, elbowDeg: pose.elbowDeg });
    }
    const { partId, name, hand } = grip;
    return { partId, name, hand, held: isHeld, shortByMm: pose.shortByMm };
  });
  held.sort((a, b) => HANDS.indexOf(a.hand) - HANDS.indexOf(b.hand));
  return { held, reach, doubled };
}

const restingGrips = (grips: readonly CadGrip[], hand: Hand): CadGrip[] =>
  grips.filter((grip) => grip.hand === hand && grip.use === 'held');

function doubledGrips(grips: readonly CadGrip[]): DoubledGrips[] {
  return HANDS.flatMap((hand) => {
    const restingOn = restingGrips(grips, hand);
    return restingOn.length > 1 ? [{ hand, names: restingOn.map(({ name }) => name) }] : [];
  });
}

/** The shoulder joint of `hand`, and the unit direction out of the torso on that side. */
function shoulderOf(hand: Hand, torso: Torso): { shoulder: Vec3Mm; outward: Vec3Mm } {
  const outward = scaled(rightOf(torso.facing), hand === 'right' ? 1 : -1);
  const halfSpanMm = (torso.statureMm * SHOULDER_SPAN_PER_STATURE) / 2;
  return { shoulder: plus(torso.centerShoulder, scaled(outward, halfSpanMm)), outward };
}

/** The driver's right facing `facing` upright: the way forward crossed with up. */
function rightOf(facing: Face): Vec3Mm {
  const sign = facing[0] === '+' ? 1 : -1;
  return faceAxis(facing) === 'x' ? { x: 0, y: 0, z: sign } : { x: -sign, y: 0, z: 0 };
}
