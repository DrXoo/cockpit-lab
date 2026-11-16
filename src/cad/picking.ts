// Picking a part of a cockpit design under the pointer: the first part a ray meets, the face it
// enters through and the point there. Each part's box is axis-aligned in its own tilted frame
// (src/cad/assembly.ts), so the ray is turned into that frame before it is tested against the
// box, and the face and point are given in that frame, as attachments measure them.
import {
  offsetInTiltedFrame,
  type BoxMm,
  type Face,
  type ResolvedPart,
  type Vec3Mm,
} from './assembly.ts';

export interface RayMm {
  originMm: Vec3Mm;
  /** Any length; only the direction counts. */
  directionMm: Vec3Mm;
}

export interface PartHit {
  partId: string;
  face: Face;
  /** Where the ray meets the face, in the part's frame. */
  pointMm: Vec3Mm;
}

const ORIGIN: Vec3Mm = { x: 0, y: 0, z: 0 };
const AXES = ['x', 'y', 'z'] as const;

interface BoxEntry {
  /** How far along the ray it enters the box, in units of its direction. */
  distance: number;
  face: Face;
}

/** The first part the ray meets in front of its origin, or null. */
export function hitAlongRay(
  resolved: ReadonlyMap<string, ResolvedPart>,
  ray: RayMm,
): PartHit | null {
  let nearest: (PartHit & { distance: number }) | null = null;
  for (const [partId, part] of resolved) {
    const inFrame: RayMm = {
      originMm: offsetInTiltedFrame(ORIGIN, ray.originMm, part.tiltDeg),
      directionMm: offsetInTiltedFrame(ORIGIN, ray.directionMm, part.tiltDeg),
    };
    const entry = entryIntoBox(part.box, inFrame);
    if (entry === null || (nearest !== null && entry.distance >= nearest.distance)) continue;
    const { originMm, directionMm } = inFrame;
    const pointMm = {
      x: originMm.x + directionMm.x * entry.distance,
      y: originMm.y + directionMm.y * entry.distance,
      z: originMm.z + directionMm.z * entry.distance,
    };
    nearest = { partId, face: entry.face, pointMm, distance: entry.distance };
  }
  if (nearest === null) return null;
  const { partId, face, pointMm } = nearest;
  return { partId, face, pointMm };
}

/** Where the ray enters the box, or null if it misses it or the box is behind it. */
function entryIntoBox(box: BoxMm, { originMm, directionMm }: RayMm): BoxEntry | null {
  let enter = Number.NEGATIVE_INFINITY;
  let face: Face | null = null;
  let leave = Number.POSITIVE_INFINITY;
  for (const axis of AXES) {
    const origin = originMm[axis];
    const direction = directionMm[axis];
    if (direction === 0) {
      if (origin < box.min[axis] || origin > box.max[axis]) return null;
      continue;
    }
    const toMin = (box.min[axis] - origin) / direction;
    const toMax = (box.max[axis] - origin) / direction;
    // Going towards +, the ray enters through the face at the minimum, which looks to −.
    const entering = direction > 0 ? toMin : toMax;
    if (entering > enter) {
      enter = entering;
      face = `${direction > 0 ? '-' : '+'}${axis}`;
    }
    leave = Math.min(leave, Math.max(toMin, toMax));
  }
  if (face === null || enter > leave || leave < 0) return null;
  return { distance: Math.max(enter, 0), face };
}
