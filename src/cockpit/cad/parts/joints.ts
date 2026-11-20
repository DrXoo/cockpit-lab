// Joints: where two parts are fastened together. Every attachment and each end of a span that
// meets its part make one, automatically. A foot comes with its own adapter and a peripheral is
// bolted through its mounting pattern, so neither makes one.
import { faceAxis, oppositeFace, type Axis, type Face, type ResolvedPart } from './assembly.ts';
import { CAD_CONTACT_MM } from '../analysis/interference.ts';

export interface Joint {
  /** Stable while the attachment exists: the joined part, then the part it meets. */
  id: string;
  partId: string;
  toPartId: string;
  /** The face of `toPartId` that the part meets. */
  toFace: Face;
}

/** A joint is known by its two parts: the joined part, then the part it meets. */
export const jointIdOf = ({ partId, toPartId }: { partId: string; toPartId: string }): string =>
  `${partId}@${toPartId}`;

const jointBetween = (partId: string, toPartId: string, toFace: Face): Joint => ({
  id: jointIdOf({ partId, toPartId }),
  partId,
  toPartId,
  toFace,
});

export function jointsOf(resolved: ReadonlyMap<string, ResolvedPart>): Joint[] {
  const joints: Joint[] = [];
  for (const { part, openEnd } of resolved.values()) {
    if (part.kind === 'foot' || part.kind === 'peripheral') continue;
    const placement = part.placement;
    if (placement.kind === 'anchor') continue;
    joints.push(jointBetween(part.id, placement.parentId, placement.face));
    if (placement.kind === 'span' && !openEnd)
      joints.push(jointBetween(part.id, placement.reachesId, oppositeFace(placement.face)));
  }
  return joints;
}

const AXES: readonly Axis[] = ['x', 'y', 'z'];

/**
 * The face of `other` that `part` touches, or null when they don't: face to face within
 * contact, at the same tilt, with some area in common.
 */
export function touchingFace(part: ResolvedPart, other: ResolvedPart): Face | null {
  if (part.tiltDeg !== other.tiltDeg) return null;
  const a = part.box;
  const b = other.box;
  for (const normal of AXES) {
    const overlapping = AXES.filter((axis) => axis !== normal).every(
      (axis) =>
        Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > CAD_CONTACT_MM,
    );
    if (!overlapping) continue;
    if (Math.abs(a.min[normal] - b.max[normal]) <= CAD_CONTACT_MM) return `+${normal}`;
    if (Math.abs(a.max[normal] - b.min[normal]) <= CAD_CONTACT_MM) return `-${normal}`;
  }
  return null;
}

/** Whether `part` meets the face of `other` it touches with its end, as a profile can. */
export function meetsEndOn(part: ResolvedPart, other: ResolvedPart): boolean {
  const face = touchingFace(part, other);
  return face !== null && part.part.kind === 'profile' && part.part.axis === faceAxis(face);
}

/** A joint between two parts that only touch, made by joining them. */
export function jointOfTouching(part: ResolvedPart, other: ResolvedPart): Joint | null {
  const toFace = touchingFace(part, other);
  if (toFace === null) return null;
  return jointBetween(part.part.id, other.part.id, toFace);
}

/** Whether two parts have a joint between them, either way round. */
export const joinedTogether = (joints: readonly Joint[], a: string, b: string): boolean =>
  joints.some(
    (joint) =>
      (joint.partId === a && joint.toPartId === b) || (joint.partId === b && joint.toPartId === a),
  );

/** A catalog piece that fastens the two parts of one joint, on one side of its corner. */
export interface Connector {
  id: string;
  jointId: string;
  typeId: string;
  /** The face of the joined part (`partId`) the connector sits against. */
  side: Face;
}
