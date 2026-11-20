// Interference between the parts of one CAD cockpit design. Every part turns about X only, so
// two parts overlap when their X ranges overlap and their rectangles in the side (YZ) plane do;
// the rectangles are compared exactly, by separating axes, even at different tilts.
// A geometric check of the approximate model only.
import type { Axis, BoxMm, ResolvedPart } from '../parts/assembly.ts';
import type { PlacedConnector } from '../parts/connectors.ts';

/**
 * Overlaps up to this depth, in mm, are contact rather than interference: parts placed face to
 * face meet within floating point noise and the rounding of cut lengths to whole millimetres.
 */
export const CAD_CONTACT_MM = 0.5;

export interface CadInterference {
  partId: string;
  partName: string;
  otherId: string;
  otherName: string;
  /** The shortest distance either part would have to move to clear the other. */
  depthMm: number;
  /** The direction of that shortest way out, in the frame of the part it was measured on. */
  axis: Axis;
}

interface SidePoint {
  y: number;
  z: number;
}

/** Something that takes up room in the cockpit: a part, or a connector on a joint. */
interface Solid {
  id: string;
  name: string;
  box: BoxMm;
  tiltDeg: number;
}

/**
 * Every pair of parts or connectors that interfere, in design order, deepest first. A connector
 * sits outside the two parts of its joint, so it only touches them.
 */
export function cockpitInterferences(
  resolved: ReadonlyMap<string, ResolvedPart>,
  connectors: readonly PlacedConnector[] = [],
): CadInterference[] {
  const solids: Solid[] = [
    ...[...resolved.values()].map(({ part, box, tiltDeg }) => ({
      id: part.id,
      name: part.name,
      box,
      tiltDeg,
    })),
    ...connectors,
  ];
  const found: CadInterference[] = [];
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) {
      const overlap = shortestWayOut(solids[i], solids[j]);
      if (!overlap || overlap.depthMm <= CAD_CONTACT_MM) continue;
      found.push({
        partId: solids[i].id,
        partName: solids[i].name,
        otherId: solids[j].id,
        otherName: solids[j].name,
        ...overlap,
      });
    }
  return found.sort((a, b) => b.depthMm - a.depthMm);
}

function shortestWayOut(a: Solid, b: Solid): { depthMm: number; axis: Axis } | null {
  const alongX = penetration(a.box.min.x, a.box.max.x, b.box.min.x, b.box.max.x);
  if (alongX <= 0) return null;
  let best: { depthMm: number; axis: Axis } = { depthMm: alongX, axis: 'x' };
  const cornersA = sideCorners(a);
  const cornersB = sideCorners(b);
  for (const owner of [a, b])
    for (const axis of ['y', 'z'] as const) {
      const direction = sideAxis(owner.tiltDeg, axis);
      const depth = penetrationAlong(direction, cornersA, cornersB);
      if (depth <= 0) return null;
      if (depth < best.depthMm) best = { depthMm: depth, axis };
    }
  return best;
}

/** How far two ranges overlap, the shorter way out; zero or less when they are apart. */
function penetration(minA: number, maxA: number, minB: number, maxB: number): number {
  return Math.min(maxA - minB, maxB - minA);
}

function penetrationAlong(direction: SidePoint, a: SidePoint[], b: SidePoint[]): number {
  const project = (points: SidePoint[]) => points.map((p) => p.y * direction.y + p.z * direction.z);
  const projectedA = project(a);
  const projectedB = project(b);
  return penetration(
    Math.min(...projectedA),
    Math.max(...projectedA),
    Math.min(...projectedB),
    Math.max(...projectedB),
  );
}

const DEG_TO_RAD = Math.PI / 180;

/** A part's own Y or Z axis in the cockpit's side plane, for a frame at `tiltDeg`. */
function sideAxis(tiltDeg: number, axis: 'y' | 'z'): SidePoint {
  const cos = Math.cos(tiltDeg * DEG_TO_RAD);
  const sin = Math.sin(tiltDeg * DEG_TO_RAD);
  // The frame is the cockpit turned by -tilt about X, so its Y axis leans back as it rises.
  return axis === 'y' ? { y: cos, z: -sin } : { y: sin, z: cos };
}

/** The four corners of a part's box in the cockpit's side plane. */
function sideCorners({ box, tiltDeg }: { box: BoxMm; tiltDeg: number }): SidePoint[] {
  const yAxis = sideAxis(tiltDeg, 'y');
  const zAxis = sideAxis(tiltDeg, 'z');
  const corners: SidePoint[] = [];
  for (const y of [box.min.y, box.max.y])
    for (const z of [box.min.z, box.max.z])
      corners.push({ y: y * yAxis.y + z * zAxis.y, z: y * yAxis.z + z * zAxis.z });
  return corners;
}
