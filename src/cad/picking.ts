// Picking a part of a cockpit design under the pointer: the first part a ray meets. Each part's
// box is axis-aligned in its own tilted frame (src/cad/assembly.ts), so the ray is turned into
// that frame before it is tested against the box.
import { offsetInTiltedFrame, type BoxMm, type ResolvedPart, type Vec3Mm } from './assembly.ts';

export interface RayMm {
  originMm: Vec3Mm;
  /** Any length; only the direction counts. */
  directionMm: Vec3Mm;
}

const ORIGIN: Vec3Mm = { x: 0, y: 0, z: 0 };
const AXES = ['x', 'y', 'z'] as const;

/** The identifier of the first part the ray meets in front of its origin, or null. */
export function partAlongRay(
  resolved: ReadonlyMap<string, ResolvedPart>,
  ray: RayMm,
): string | null {
  let nearest: { id: string; distance: number } | null = null;
  for (const [id, part] of resolved) {
    const distance = distanceToBox(part.box, {
      originMm: offsetInTiltedFrame(ORIGIN, ray.originMm, part.tiltDeg),
      directionMm: offsetInTiltedFrame(ORIGIN, ray.directionMm, part.tiltDeg),
    });
    if (distance !== null && (nearest === null || distance < nearest.distance))
      nearest = { id, distance };
  }
  return nearest?.id ?? null;
}

/** How far along the ray it enters the box, in units of its direction, or null if it misses. */
function distanceToBox(box: BoxMm, { originMm, directionMm }: RayMm): number | null {
  let enter = 0;
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
    enter = Math.max(enter, Math.min(toMin, toMax));
    leave = Math.min(leave, Math.max(toMin, toMax));
    if (enter > leave) return null;
  }
  return enter;
}
