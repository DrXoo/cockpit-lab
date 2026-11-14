// The parts of a CAD cockpit design and where they end up. A part is anchored, or hangs from
// exactly one other part (ADR 0003); a span also takes its length from the part it reaches.
// Profiles are aligned with the axes of their frame. Positions are in mm in cockpit
// coordinates: +Y up, +Z to the front, -X the driver's right.
//
// An anchored part may be locked at a tilt about X, as the pedal deck is. Its box, and the
// boxes of everything hanging from it, are then axis-aligned in the cockpit coordinates
// turned by that tilt, so parts at the same tilt still compare as plain boxes.
import { footType, profileSection, profileSystem, type DataSource } from './catalog.ts';
import type { Hole, MountingPattern } from './plate.ts';

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
  /**
   * For a profile, the center of its section at its start, the end with the lower coordinate;
   * for a plate, the center of its underside; for a peripheral, its mounting origin.
   */
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
  /** Off the center of the face, towards + on the axis across it. */
  acrossMm?: number;
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

/** A leveling foot or caster under the underside of a profile, through which it stands. */
export interface FootPart {
  kind: 'foot';
  id: string;
  name: string;
  footTypeId: string;
  placement: Attachment;
}

/** A flat piece cut from sheet, lying in its frame: thickness along Y, depth along Z. */
export interface PlatePart {
  kind: 'plate';
  id: string;
  name: string;
  widthMm: number;
  depthMm: number;
  thicknessMm: number;
  ownHoles: readonly Hole[];
  placement: Anchor | Attachment;
}

export type ContactRole = 'hip' | 'heel' | 'hands';

/** Where the driver meets a peripheral, relative to its mounting origin. */
export interface ContactPoint {
  role: ContactRole;
  offsetMm: Vec3Mm;
}

/**
 * A device mounted on the cockpit. Its envelope stands on its mounting origin, the center of
 * the envelope's underside, and its mounting pattern and contact points are measured from it,
 * so resizing the envelope never moves them.
 */
export interface PeripheralPart {
  kind: 'peripheral';
  id: string;
  name: string;
  envelope: { widthMm: number; heightMm: number; depthMm: number };
  mountingPattern: MountingPattern;
  contactPoints: readonly ContactPoint[];
  /** For a seat, the backrest's angle back from upright. */
  backrestDeg?: number;
  source: DataSource;
  placement: Anchor | Attachment;
}

export type Part = ProfilePart | FootPart | PlatePart | PeripheralPart;

export interface ResolvedPart {
  part: Part;
  /** The tilt about X of the frame the box is aligned with. */
  tiltDeg: number;
  /** The part's box in the cockpit coordinates turned by `tiltDeg`. */
  box: BoxMm;
  /** A profile's length; for other parts, their height. */
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
  switch (part.kind) {
    case 'profile':
      return resolveProfile(part, dependency);
    case 'foot':
      return resolveFoot(part, dependency);
    case 'plate':
      return resolveStanding(part, dependency, {
        widthMm: part.widthMm,
        heightMm: part.thicknessMm,
        depthMm: part.depthMm,
      });
    case 'peripheral':
      return resolveStanding(part, dependency, part.envelope);
  }
}

interface Size {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

/** A box standing on `originMm`, centered on it across X and Z. */
const boxOn = (originMm: Vec3Mm, size: Size): BoxMm => ({
  min: { x: originMm.x - size.widthMm / 2, y: originMm.y, z: originMm.z - size.depthMm / 2 },
  max: {
    x: originMm.x + size.widthMm / 2,
    y: originMm.y + size.heightMm,
    z: originMm.z + size.depthMm / 2,
  },
});

/** A plate or peripheral, anchored or sitting on top of a face. */
function resolveStanding(
  part: PlatePart | PeripheralPart,
  dependency: (id: string) => ResolvedPart,
  size: Size,
): ResolvedPart {
  const placement = part.placement;
  const resolvedAs = (tiltDeg: number, originMm: Vec3Mm): ResolvedPart => ({
    part,
    tiltDeg,
    box: boxOn(originMm, size),
    lengthMm: size.heightMm,
    openEnd: false,
  });
  if (placement.kind === 'anchor') {
    const tiltDeg = placement.tiltDeg ?? 0;
    return resolvedAs(tiltDeg, intoTiltedFrame(placement.startMm, tiltDeg));
  }
  if (placement.face !== '+y')
    throw new Error(`${part.name} must sit on top of a face, not on face ${placement.face}.`);
  const parent = dependency(placement.parentId);
  return resolvedAs(parent.tiltDeg, attachmentPoint(parent, placement));
}

function resolveFoot(foot: FootPart, dependency: (id: string) => ResolvedPart): ResolvedPart {
  if (foot.placement.face !== '-y')
    throw new Error(
      `Foot ${foot.id} must hang from an underside, not face ${foot.placement.face}.`,
    );
  const parent = dependency(foot.placement.parentId);
  const top = attachmentPoint(parent, foot.placement);
  const type = footType(foot.footTypeId);
  const box = {
    min: { x: top.x - type.widthMm / 2, y: top.y - type.heightMm, z: top.z - type.depthMm / 2 },
    max: { x: top.x + type.widthMm / 2, y: top.y, z: top.z + type.depthMm / 2 },
  };
  return { part: foot, tiltDeg: parent.tiltDeg, box, lengthMm: type.heightMm, openEnd: false };
}

function resolveProfile(part: ProfilePart, dependency: (id: string) => ResolvedPart): ResolvedPart {
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

/** The contact points of a peripheral in cockpit coordinates; none for other parts. */
export function contactPointsMm(resolved: ResolvedPart): { role: ContactRole; pointMm: Vec3Mm }[] {
  if (resolved.part.kind !== 'peripheral') return [];
  const { box, tiltDeg } = resolved;
  const origin = center(box);
  origin.y = box.min.y;
  return resolved.part.contactPoints.map(({ role, offsetMm }) => ({
    role,
    pointMm: outOfTiltedFrame(
      { x: origin.x + offsetMm.x, y: origin.y + offsetMm.y, z: origin.z + offsetMm.z },
      tiltDeg,
    ),
  }));
}

/** The cockpit point at `offsetMm` from `pivotMm`, measured in a frame at `tiltDeg`. */
export function tiltedFromPivot(pivotMm: Vec3Mm, offsetMm: Vec3Mm, tiltDeg: number): Vec3Mm {
  const turned = outOfTiltedFrame(offsetMm, tiltDeg);
  return { x: pivotMm.x + turned.x, y: pivotMm.y + turned.y, z: pivotMm.z + turned.z };
}

/** The offset from `fromMm` to `toMm`, both cockpit points, measured in a frame at `tiltDeg`. */
export function offsetInTiltedFrame(fromMm: Vec3Mm, toMm: Vec3Mm, tiltDeg: number): Vec3Mm {
  const offset = { x: toMm.x - fromMm.x, y: toMm.y - fromMm.y, z: toMm.z - fromMm.z };
  return intoTiltedFrame(offset, tiltDeg);
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

/**
 * The point on the parent's face where an attachment sits, `acrossMm` off its center. On an
 * end face, the only point is its center.
 */
function attachmentPoint(parent: ResolvedPart, attachment: Attachment | Span): Vec3Mm {
  const along = alongAxisOf(parent.part);
  const { box } = parent;
  const point = center(box);
  const normal = faceAxis(attachment.face);
  point[normal] = faceSign(attachment.face) > 0 ? box.max[normal] : box.min[normal];
  if (along === normal) {
    if (attachment.alongMm !== 0)
      throw new Error(`An attachment to the end face of ${parent.part.id} must be at 0 mm.`);
    return point;
  }
  point[along] =
    attachment.fromEnd === 'start'
      ? box.min[along] + attachment.alongMm
      : box.max[along] - attachment.alongMm;
  const across = AXES.find((axis) => axis !== normal && axis !== along);
  if (across) point[across] += attachment.acrossMm ?? 0;
  return point;
}

/** The axis an attachment's distance runs along: a profile's length, or a plate's depth. */
function alongAxisOf(part: Part): Axis {
  if (part.kind === 'profile') return part.axis;
  if (part.kind === 'plate') return 'z';
  throw new Error(`Nothing can hang from ${part.kind} ${part.id}.`);
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
