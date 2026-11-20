// Whether a peripheral mounted on a profile can be bolted to it: each hole of its mounting
// pattern takes a T-nut only over the slot of a profile right under it, such as a seat's holes
// over two rails. On a plate, the plate is made with its holes (hole-problems.ts). A warning of
// the approximate model, with the peripheral where its operation mounts it, at the center of its
// travel: nothing refuses an edit.
import { round } from '../../../shared/geometry.ts';
import {
  faceAxis,
  peripheralPointInFrame,
  type Axis,
  type Face,
  type ResolvedPart,
  type Vec3Mm,
} from '../parts/assembly.ts';
import { slotCentersAcross } from '../parts/connectors.ts';
import { SLOT_ALIGNMENT_MM } from './hole-problems.ts';
import { CAD_CONTACT_MM } from './interference.ts';

export interface PeripheralHoleProblem {
  peripheralId: string;
  /** The hole it is about, by its place in the peripheral's mounting pattern. */
  holeIndex: number;
  text: string;
}

const AXES: readonly Axis[] = ['x', 'y', 'z'];

/** The holes of every peripheral mounted on a profile that miss the slot of a profile under them. */
export function peripheralHoleProblems(
  resolved: ReadonlyMap<string, ResolvedPart>,
): PeripheralHoleProblem[] {
  const parts = [...resolved.values()];
  return parts.flatMap((peripheral) => {
    const { part } = peripheral;
    if (part.kind !== 'peripheral' || part.placement.kind === 'anchor') return [];
    const parent = resolved.get(part.placement.parentId);
    if (parent?.part.kind !== 'profile') return [];
    const up = part.placement.face;
    return part.mountingPattern.holes.flatMap((hole, holeIndex) => {
      const pointMm = peripheralPointInFrame(peripheral, { x: hole.xMm, y: 0, z: hole.yMm });
      const text = holeProblem(pointMm, up, peripheral, parts);
      if (text === null) return [];
      return [
        { peripheralId: part.id, holeIndex, text: `${part.name}, hole ${holeIndex + 1} ${text}` },
      ];
    });
  });
}

/** What is wrong with a hole at `pointMm` on the underside of a peripheral facing `up`, or null. */
function holeProblem(
  pointMm: Vec3Mm,
  up: Face,
  peripheral: ResolvedPart,
  parts: readonly ResolvedPart[],
): string | null {
  const normal = faceAxis(up);
  const under = parts.filter((candidate) => isProfileUnder(candidate, pointMm, up, peripheral));
  if (under.length === 0) return 'is over no profile to bolt into';
  const offsets = under.map((profile) => ({
    profile,
    offMm: offSlotMm(profile, pointMm, normal),
  }));
  if (offsets.some(({ offMm }) => offMm <= SLOT_ALIGNMENT_MM)) return null;
  const nearest = offsets.reduce((a, b) => (b.offMm < a.offMm ? b : a));
  return `is ${round(nearest.offMm, 1)} mm off the slot of ${nearest.profile.part.name}`;
}

/**
 * Whether `candidate` is a profile whose side face the hole at `pointMm` rests on: in the frame
 * of the peripheral's tilt, its face at the peripheral's underside and the hole over it.
 */
function isProfileUnder(
  candidate: ResolvedPart,
  pointMm: Vec3Mm,
  up: Face,
  peripheral: ResolvedPart,
): boolean {
  const { part, box } = candidate;
  const normal = faceAxis(up);
  if (part.kind !== 'profile' || part.axis === normal) return false;
  if (candidate.tiltDeg !== peripheral.tiltDeg) return false;
  // The peripheral stands out of the face, so the profile's face it rests on looks the same way.
  const faceMm = up[0] === '+' ? box.max[normal] : box.min[normal];
  if (Math.abs(faceMm - pointMm[normal]) > CAD_CONTACT_MM) return false;
  return AXES.filter((axis) => axis !== normal).every(
    (axis) => pointMm[axis] >= box.min[axis] && pointMm[axis] <= box.max[axis],
  );
}

/** How far across a profile's face a point is from the center line of its nearest slot. */
function offSlotMm(profile: ResolvedPart, pointMm: Vec3Mm, normal: Axis): number {
  if (profile.part.kind !== 'profile') throw new Error(`${profile.part.name} is not a profile.`);
  const lengthAxis = profile.part.axis;
  const across = AXES.find((axis) => axis !== normal && axis !== lengthAxis) ?? 'x';
  const lines = slotCentersAcross(profile, across);
  return Math.min(...lines.map((lineMm) => Math.abs(pointMm[across] - lineMm)));
}
