// The parts of a CAD cockpit design and where they end up. A part is anchored, or hangs from
// exactly one other part (ADR 0003); a span also takes its length from the part it reaches.
// Profiles are aligned with the axes of their frame. Positions are in mm in cockpit
// coordinates: +Y up, +Z to the front, -X the driver's right.
//
// An anchored part may be locked at a tilt about X, as the pedal deck is. Its box, and the
// boxes of everything hanging from it, are then axis-aligned in the cockpit coordinates
// turned by that tilt, so parts at the same tilt still compare as plain boxes.
import {
  footType,
  profileSection,
  profileSystem,
  sheetType,
  type DataSource,
  type PeripheralCategory,
} from './catalog.ts';
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
   * for a plate, the center of its underside, the face it rests on; for a peripheral, its
   * mounting origin.
   */
  startMm: Vec3Mm;
  /** A positive tilt raises the part's front (+Z) end. */
  tiltDeg?: number;
}

export interface Attachment {
  kind: 'attachment';
  parentId: string;
  /** The face of the parent the part grows out of, perpendicular to it unless it lies on it. */
  face: Face;
  /** Distance along the parent from the end named by `fromEnd`. */
  alongMm: number;
  fromEnd: 'start' | 'end';
  /** Off the center of the face, towards + on the axis across it. */
  acrossMm?: number;
  /**
   * For a profile lying on the face rather than growing out of it, the way it runs from the
   * attachment point, along the face; its section rests on the face.
   */
  lying?: Face;
}

/** An attachment whose far end meets the facing face of another part. */
export interface Span extends Omit<Attachment, 'kind' | 'lying'> {
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

/**
 * A flat piece cut from sheet. It rests on its underside, on a side face of the profile it hangs
 * from, and its thickness stands out of that face; its width runs along the third axis.
 */
export interface PlatePart {
  kind: 'plate';
  id: string;
  name: string;
  widthMm: number;
  depthMm: number;
  sheetId: string;
  /** The way its thickness stands out of its underside: '+y' for a plate lying flat on top. */
  normal: Face;
  /** The axis its depth runs along, never its normal's. */
  depthAxis: Axis;
  ownHoles: readonly Hole[];
  placement: Anchor | Attachment;
}

export type ContactRole = 'hip' | 'heel' | 'hands';
export const CONTACT_ROLES: readonly ContactRole[] = ['hip', 'heel', 'hands'];

/** The box a peripheral takes, in its own frame: width across, height up, depth to its front. */
export interface Envelope {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

/** Where the driver meets a peripheral, relative to its mounting origin. */
export interface ContactPoint {
  role: ContactRole;
  offsetMm: Vec3Mm;
}

/**
 * A device mounted on the cockpit. Its envelope stands on its mounting origin, the center of
 * the envelope's underside, and its mounting pattern and contact points are measured from it,
 * so resizing the envelope never moves them.
 *
 * It has a frame of its own: up out of the face it is mounted on (+Y for an anchored one), its
 * front the way it faces (+Z), and across (+X) the third axis, as +X is to the cockpit. Its
 * height runs up, its depth along its front and its width across; contact points are measured
 * in that frame.
 */
export interface PeripheralPart {
  kind: 'peripheral';
  id: string;
  name: string;
  category: PeripheralCategory;
  envelope: Envelope;
  mountingPattern: MountingPattern;
  contactPoints: readonly ContactPoint[];
  /** For a seat, the backrest's angle back from upright. */
  backrestDeg?: number;
  source: DataSource;
  /**
   * The way the driver faces when using it, along the face it is mounted on: +Z, the front of
   * the cockpit, for a peripheral mounted as usual.
   */
  facing: Face;
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

/** The axis a face looks along. */
export const faceAxis = (face: Face): Axis => (face[1] === 'x' ? 'x' : face[1] === 'y' ? 'y' : 'z');
const faceSign = (face: Face): 1 | -1 => (face[0] === '+' ? 1 : -1);

const OPPOSITE_FACES: Record<Face, Face> = {
  '+x': '-x',
  '-x': '+x',
  '+y': '-y',
  '-y': '+y',
  '+z': '-z',
  '-z': '+z',
};
/** The face on the other side of a box, looking the other way. */
export const oppositeFace = (face: Face): Face => OPPOSITE_FACES[face];

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
    const result = resolvePart(
      part,
      (dependency) => resolve(dependency, id),
      (other) => byId.has(other),
    );
    resolving.delete(id);
    resolved.set(id, result);
    return result;
  };

  for (const part of parts) resolve(part.id, part.id);
  return resolved;
}

/** Finds a part a placement depends on, resolving it first; it fails when the part is missing. */
type Dependency = (id: string) => ResolvedPart;

function resolvePart(
  part: Part,
  dependency: Dependency,
  inDesign: (id: string) => boolean,
): ResolvedPart {
  switch (part.kind) {
    case 'profile':
      return resolveProfile(part, dependency, inDesign);
    case 'foot':
      return resolveFoot(part, dependency);
    case 'plate':
      return resolvePlate(part, dependency);
    case 'peripheral':
      return resolvePeripheral(part, dependency);
  }
}

/** A peripheral, anchored or standing out of the face it is mounted on. */
function resolvePeripheral(part: PeripheralPart, dependency: Dependency): ResolvedPart {
  const placement = part.placement;
  const frame = peripheralFrame(part);
  const resolvedAs = (tiltDeg: number, originMm: Vec3Mm): ResolvedPart => ({
    part,
    tiltDeg,
    box: peripheralBox(part, frame, originMm),
    lengthMm: part.envelope.heightMm,
    openEnd: false,
  });
  if (placement.kind === 'anchor') {
    const tiltDeg = placement.tiltDeg ?? 0;
    return resolvedAs(tiltDeg, intoTiltedFrame(placement.startMm, tiltDeg));
  }
  const parent = dependency(placement.parentId);
  return resolvedAs(parent.tiltDeg, attachmentPoint(parent, placement));
}

/** The faces a peripheral's own axes look along, in the frame of its tilt. */
interface PeripheralFrame {
  across: Face;
  up: Face;
  front: Face;
}

function peripheralFrame(part: PeripheralPart): PeripheralFrame {
  const up: Face = part.placement.kind === 'anchor' ? '+y' : part.placement.face;
  const front = part.facing;
  if (faceAxis(front) === faceAxis(up))
    throw new Error(
      `${part.name} faces ${front}, out of the face it is mounted on: it must face along it.`,
    );
  return { across: crossFace(up, front), up, front };
}

/** The face that the cross product of the directions two faces look along looks along. */
function crossFace(a: Face, b: Face): Face {
  const from = AXES.indexOf(faceAxis(a));
  const to = AXES.indexOf(faceAxis(b));
  const third = AXES[3 - from - to];
  const cyclic = (to - from + 3) % 3 === 1;
  const sign = faceSign(a) * faceSign(b) * (cyclic ? 1 : -1);
  return `${sign > 0 ? '+' : '-'}${third}`;
}

/** The box of a peripheral standing out of its face on `originMm`, centered on it across. */
function peripheralBox(part: PeripheralPart, frame: PeripheralFrame, originMm: Vec3Mm): BoxMm {
  const { widthMm, heightMm, depthMm } = part.envelope;
  const min = { ...originMm };
  const max = { ...originMm };
  const centeredSizes: [Face, number][] = [
    [frame.across, widthMm],
    [frame.front, depthMm],
  ];
  for (const [face, sizeMm] of centeredSizes) {
    min[faceAxis(face)] -= sizeMm / 2;
    max[faceAxis(face)] += sizeMm / 2;
  }
  const upAxis = faceAxis(frame.up);
  if (faceSign(frame.up) > 0) max[upAxis] += heightMm;
  else min[upAxis] -= heightMm;
  return { min, max };
}

/** A plate, anchored where its underside is, or resting on a side face of a profile. */
function resolvePlate(plate: PlatePart, dependency: Dependency): ResolvedPart {
  const normal = faceAxis(plate.normal);
  if (plate.depthAxis === normal)
    throw new Error(`The depth of ${plate.name} cannot run out of the face it rests on.`);
  const { placement } = plate;
  const resolvedAs = (tiltDeg: number, undersideMm: Vec3Mm): ResolvedPart => {
    const thicknessMm = sheetType(plate.sheetId).thicknessMm;
    return {
      part: plate,
      tiltDeg,
      box: plateBox(plate, undersideMm, thicknessMm),
      lengthMm: thicknessMm,
      openEnd: false,
    };
  };
  if (placement.kind === 'anchor') {
    const tiltDeg = placement.tiltDeg ?? 0;
    return resolvedAs(tiltDeg, intoTiltedFrame(placement.startMm, tiltDeg));
  }
  if (placement.face !== plate.normal)
    throw new Error(`${plate.name} must face the way the face it rests on does.`);
  const parent = dependency(placement.parentId);
  if (parent.part.kind !== 'profile' || parent.part.axis === normal)
    throw new Error(`${plate.name} must rest on a side of a profile, not on its end.`);
  return resolvedAs(parent.tiltDeg, attachmentPoint(parent, placement));
}

/** The box of a plate whose underside is centered on `undersideMm`. */
function plateBox(plate: PlatePart, undersideMm: Vec3Mm, thicknessMm: number): BoxMm {
  const normal = faceAxis(plate.normal);
  const half: Vec3Mm = { x: plate.widthMm / 2, y: plate.widthMm / 2, z: plate.widthMm / 2 };
  half[plate.depthAxis] = plate.depthMm / 2;
  half[normal] = 0;
  const min = { x: undersideMm.x - half.x, y: undersideMm.y - half.y, z: undersideMm.z - half.z };
  const max = { x: undersideMm.x + half.x, y: undersideMm.y + half.y, z: undersideMm.z + half.z };
  if (faceSign(plate.normal) > 0) max[normal] += thicknessMm;
  else min[normal] -= thicknessMm;
  return { min, max };
}

function resolveFoot(foot: FootPart, dependency: Dependency): ResolvedPart {
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

function resolveProfile(
  part: ProfilePart,
  dependency: Dependency,
  inDesign: (id: string) => boolean,
): ResolvedPart {
  const placement = part.placement;
  if (placement.kind === 'anchor') {
    const tiltDeg = placement.tiltDeg ?? 0;
    const start = intoTiltedFrame(placement.startMm, tiltDeg);
    const box = profileBox(part, start, part.lengthMm);
    return { part, tiltDeg, box, lengthMm: part.lengthMm, openEnd: false };
  }
  const parent = dependency(placement.parentId);
  const facePoint = attachmentPoint(parent, placement);
  if (placement.kind === 'attachment' && placement.lying)
    return resolveLying(part, parent, facePoint, placement.face, placement.lying);
  if (part.axis !== faceAxis(placement.face))
    throw new Error(`Part ${part.id} must run perpendicular to face ${placement.face}.`);
  let lengthMm = part.lengthMm;
  let openEnd = false;
  // A span whose part is gone keeps its last length, as one whose faces stopped facing does.
  if (placement.kind === 'span' && !inDesign(placement.reachesId)) openEnd = true;
  else if (placement.kind === 'span') {
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

/** A profile lying on a face: its section rests on it, and it runs `way` from `facePoint`. */
function resolveLying(
  part: ProfilePart,
  parent: ResolvedPart,
  facePoint: Vec3Mm,
  face: Face,
  way: Face,
): ResolvedPart {
  const normal = faceAxis(face);
  if (part.axis !== faceAxis(way) || part.axis === normal)
    throw new Error(`Part ${part.id} must run along face ${face}, the way it lies: ${way}.`);
  const section = profileSection(profileSystem(part.systemId), part.sectionId);
  const restingMm = part.heightAxis === normal ? section.heightMm : section.widthMm;
  const start = { ...facePoint };
  start[normal] += (faceSign(face) * restingMm) / 2;
  if (faceSign(way) < 0) start[part.axis] -= part.lengthMm;
  const box = profileBox(part, start, part.lengthMm);
  return { part, tiltDeg: parent.tiltDeg, box, lengthMm: part.lengthMm, openEnd: false };
}

/**
 * The anchor that keeps a resolved profile or plate where it is, at the tilt of its frame: how a
 * part that hung from a removed one stays in place.
 */
export function anchorWhereItIs(resolved: ResolvedPart): Anchor {
  const { part, box, tiltDeg } = resolved;
  const startInFrame = center(box);
  if (part.kind === 'profile') startInFrame[part.axis] = box.min[part.axis];
  else if (part.kind === 'plate') {
    const normal = faceAxis(part.normal);
    startInFrame[normal] = faceSign(part.normal) > 0 ? box.min[normal] : box.max[normal];
  } else throw new Error(`Only a profile or a plate can be anchored where it is.`);
  const startMm = outOfTiltedFrame(startInFrame, tiltDeg);
  return tiltDeg === 0 ? { kind: 'anchor', startMm } : { kind: 'anchor', startMm, tiltDeg };
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
  return resolved.part.contactPoints.map(({ role, offsetMm }) => ({
    role,
    pointMm: partPointMm(resolved, offsetMm),
  }));
}

/**
 * The cockpit point at `offsetMm` from the mounting origin of a plate or peripheral, the center
 * of its underside: measured in a peripheral's own frame, or in the frame of a plate's tilt.
 */
export function partPointMm(resolved: ResolvedPart, offsetMm: Vec3Mm): Vec3Mm {
  const { part, box, tiltDeg } = resolved;
  if (part.kind === 'peripheral')
    return outOfTiltedFrame(peripheralPoint(part, box, offsetMm), tiltDeg);
  if (part.kind !== 'plate')
    throw new Error(`A ${part.kind} has no mounting origin to measure from.`);
  const origin = center(box);
  origin.y = box.min.y;
  return outOfTiltedFrame(
    { x: origin.x + offsetMm.x, y: origin.y + offsetMm.y, z: origin.z + offsetMm.z },
    tiltDeg,
  );
}

/**
 * The point at `offsetMm` from a resolved peripheral's mounting origin, measured in its own
 * frame, given in the frame of its tilt as its box is: how its shapes are drawn.
 */
export function peripheralPointInFrame(resolved: ResolvedPart, offsetMm: Vec3Mm): Vec3Mm {
  if (resolved.part.kind !== 'peripheral')
    throw new Error(`${resolved.part.name} is not a peripheral.`);
  return peripheralPoint(resolved.part, resolved.box, offsetMm);
}

/** The point at `offsetMm` from a peripheral's mounting origin, in the frame of its tilt. */
function peripheralPoint(part: PeripheralPart, box: BoxMm, offsetMm: Vec3Mm): Vec3Mm {
  const frame = peripheralFrame(part);
  const point = center(box);
  const upAxis = faceAxis(frame.up);
  point[upAxis] = faceSign(frame.up) > 0 ? box.min[upAxis] : box.max[upAxis];
  const offsets: [Face, number][] = [
    [frame.across, offsetMm.x],
    [frame.up, offsetMm.y],
    [frame.front, offsetMm.z],
  ];
  for (const [face, distanceMm] of offsets) point[faceAxis(face)] += faceSign(face) * distanceMm;
  return point;
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
  if (part.kind === 'plate') return part.depthAxis;
  throw new Error(`Nothing can hang from ${part.kind} ${part.id}.`);
}

/**
 * The distance from a point on a face, outwards, to the facing face of `target`, or null
 * when the line out of the face misses it or the target is behind.
 */
export function gapTo(target: BoxMm, from: Vec3Mm, face: Face): number | null {
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
