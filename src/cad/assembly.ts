// The parts of a CAD cockpit design and where they end up. A part is anchored, or hangs from
// exactly one other part (ADR 0003); a span also takes its length from the part it reaches.
// Profiles are aligned with the axes of their frame. Positions are in mm in cockpit
// coordinates: +Y up, +Z to the front, -X the driver's right.
//
// An anchored part may be locked at a tilt about X, as the pedal deck is. Its box, and the
// boxes of everything hanging from it, are then axis-aligned in the cockpit coordinates
// turned by that tilt, so parts at the same tilt still compare as plain boxes.
import { profileSection, profileSystem } from './catalog.ts';

export type Axis = 'x' | 'y' | 'z';
export type Face = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export interface Vec3Mm {
  x: number;
  y: number;
  z: number;
}

/** An axis-aligned box in mm. */
export interface BoxMm {
  min: Vec3Mm;
  max: Vec3Mm;
}

export interface Anchor {
  kind: 'anchor';
  /** The center of the profile's section at its start, the end with the lower coordinate. */
  startMm: Vec3Mm;
  /** A positive tilt raises the part's front (+Z) end. */
  tiltDeg?: number;
}

export interface Attachment {
  kind: 'attachment';
  parentId: string;
  /** The face of the parent the part grows out of, perpendicular to it. */
  face: Face;
  /** Distance along the parent from the end named by `fromEnd`. */
  alongMm: number;
  fromEnd: 'start' | 'end';
}

/** An attachment whose far end meets the facing face of another part. */
export interface Span extends Omit<Attachment, 'kind'> {
  kind: 'span';
  reachesId: string;
}

export interface ProfilePart {
  kind: 'profile';
  id: string;
  name: string;
  systemId: string;
  sectionId: string;
  /** The axis the profile's length runs along. */
  axis: Axis;
  /** The axis the section's height runs along, such as the 80 mm side of a 40 × 80. */
  heightAxis: Axis;
  /** For a span, the last length it took; kept when its faces stop facing each other. */
  lengthMm: number;
  placement: Anchor | Attachment | Span;
}

export type Part = ProfilePart;

export interface ResolvedPart {
  part: Part;
  /** The tilt about X of the frame the box is aligned with. */
  tiltDeg: number;
  /** The part's box in the cockpit coordinates turned by `tiltDeg`. */
  box: BoxMm;
  lengthMm: number;
  /** A span whose far end does not meet the part it reaches. */
  openEnd: boolean;
}

const AXES: readonly Axis[] = ['x', 'y', 'z'];

const faceAxis = (face: Face): Axis => face[1] as Axis;
const faceSign = (face: Face): 1 | -1 => (face[0] === '+' ? 1 : -1);

/** Resolves every part's box, parents first. Fails on missing parts and dependency loops. */
export function resolveAssembly(parts: readonly Part[]): Map<string, ResolvedPart> {
  const byId = new Map(parts.map((part) => [part.id, part]));
  const resolved = new Map<string, ResolvedPart>();
  const resolving = new Set<string>();

  const resolve = (id: string, neededBy: string): ResolvedPart => {
    const done = resolved.get(id);
    if (done) return done;
    const part = byId.get(id);
    if (!part) throw new Error(`Part ${neededBy} depends on ${id}, which is not in the design.`);
    if (resolving.has(id)) throw new Error(`Part ${id} depends on itself.`);
    resolving.add(id);
    const result = resolvePart(part, (dependency) => resolve(dependency, id));
    resolving.delete(id);
    resolved.set(id, result);
    return result;
  };

  for (const part of parts) resolve(part.id, part.id);
  return resolved;
}

function resolvePart(part: Part, dependency: (id: string) => ResolvedPart): ResolvedPart {
  const placement = part.placement;
  if (placement.kind === 'anchor') {
    const tiltDeg = placement.tiltDeg ?? 0;
    const start = intoTiltedFrame(placement.startMm, tiltDeg);
    const box = profileBox(part, start, part.lengthMm);
    return { part, tiltDeg, box, lengthMm: part.lengthMm, openEnd: false };
  }
  const parent = dependency(placement.parentId);
  const facePoint = attachmentPoint(parent, placement);
  if (part.axis !== faceAxis(placement.face))
    throw new Error(`Part ${part.id} must run perpendicular to face ${placement.face}.`);
  let lengthMm = part.lengthMm;
  let openEnd = false;
  if (placement.kind === 'span') {
    const reached = dependency(placement.reachesId);
    if (reached.tiltDeg !== parent.tiltDeg)
      throw new Error(`Span ${part.id} cannot reach ${reached.part.id}, which is at another tilt.`);
    const gap = gapTo(reached.box, facePoint, placement.face);
    if (gap === null) openEnd = true;
    else lengthMm = gap;
  }
  const start = { ...facePoint };
  if (faceSign(placement.face) < 0) start[part.axis] -= lengthMm;
  const box = profileBox(part, start, lengthMm);
  return { part, tiltDeg: parent.tiltDeg, box, lengthMm, openEnd };
}

/** The eight corners of a resolved part in cockpit coordinates. */
export function cornersMm(resolved: ResolvedPart): Vec3Mm[] {
  const { min, max } = resolved.box;
  const corners: Vec3Mm[] = [];
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z]) corners.push(outOfTiltedFrame({ x, y, z }, resolved.tiltDeg));
  return corners;
}

const DEG_TO_RAD = Math.PI / 180;

/** Turns a point about X by `angleDeg`, so +Y goes towards +Z for a positive angle. */
function turnAboutX(point: Vec3Mm, angleDeg: number): Vec3Mm {
  if (angleDeg === 0) return { ...point };
  const cos = Math.cos(angleDeg * DEG_TO_RAD);
  const sin = Math.sin(angleDeg * DEG_TO_RAD);
  return { x: point.x, y: point.y * cos - point.z * sin, z: point.y * sin + point.z * cos };
}

const intoTiltedFrame = (point: Vec3Mm, tiltDeg: number) => turnAboutX(point, tiltDeg);
const outOfTiltedFrame = (point: Vec3Mm, tiltDeg: number) => turnAboutX(point, -tiltDeg);

/** The point on the parent's face where an attachment sits, centered across the face. */
function attachmentPoint(parent: ResolvedPart, attachment: Attachment | Span): Vec3Mm {
  const { box } = parent;
  const point = center(box);
  const normal = faceAxis(attachment.face);
  point[normal] = faceSign(attachment.face) > 0 ? box.max[normal] : box.min[normal];
  const along = parent.part.axis;
  if (along === normal) throw new Error(`Part ${parent.part.id} has no length along its end face.`);
  point[along] =
    attachment.fromEnd === 'start'
      ? box.min[along] + attachment.alongMm
      : box.max[along] - attachment.alongMm;
  return point;
}

/**
 * The distance from a point on a face, outwards, to the facing face of `target`, or null
 * when the line out of the face misses it or the target is behind.
 */
function gapTo(target: BoxMm, from: Vec3Mm, face: Face): number | null {
  const normal = faceAxis(face);
  for (const axis of AXES) {
    if (axis === normal) continue;
    if (from[axis] < target.min[axis] || from[axis] > target.max[axis]) return null;
  }
  const gap =
    faceSign(face) > 0 ? target.min[normal] - from[normal] : from[normal] - target.max[normal];
  return gap >= 0 ? gap : null;
}

function profileBox(part: ProfilePart, startMm: Vec3Mm, lengthMm: number): BoxMm {
  const section = profileSection(profileSystem(part.systemId), part.sectionId);
  if (part.heightAxis === part.axis)
    throw new Error(`Part ${part.id} cannot have its section height along its length.`);
  const half: Vec3Mm = { x: section.widthMm / 2, y: section.widthMm / 2, z: section.widthMm / 2 };
  half[part.heightAxis] = section.heightMm / 2;
  const min = { x: startMm.x - half.x, y: startMm.y - half.y, z: startMm.z - half.z };
  const max = { x: startMm.x + half.x, y: startMm.y + half.y, z: startMm.z + half.z };
  min[part.axis] = startMm[part.axis];
  max[part.axis] = startMm[part.axis] + lengthMm;
  return { min, max };
}

function center(box: BoxMm): Vec3Mm {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}
