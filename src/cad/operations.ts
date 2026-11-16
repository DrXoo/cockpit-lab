// The operations of a design history, as the file format stores them, and the part each one
// makes when it is replayed (docs/adr/0005). Every kind of operation, and every value it holds,
// is part of the file format. Lengths are in mm.
import { faceAxis, type Axis, type Face, type ProfilePart, type Vec3Mm } from './assembly.ts';
import { profileSystem } from './catalog.ts';

/** What every profile is made with, wherever it is placed. */
export interface ProfileShape {
  name: string;
  systemId: string;
  sectionId: string;
  /** The axis its section's height runs along; never its length axis. */
  heightAxis: Axis;
  lengthMm: number;
}

/** Adds a profile placed on its own, hanging from no other part. */
export interface AddAnchoredProfile extends ProfileShape {
  kind: 'add-anchored-profile';
  id: string;
  /** The part it makes; the identifier stays the same every time the history is replayed. */
  partId: string;
  /** The axis its length runs along. */
  axis: Axis;
  /** The center of its section at its start, the end with the lower coordinate. */
  startMm: Vec3Mm;
}

/** The end of a parent a distance along it is measured from: the lower coordinate is the start. */
export type ParentEnd = 'start' | 'end';

/**
 * Grows a profile out of a face of another part, which it hangs from: its position follows that
 * part wherever it moves.
 */
export interface GrowProfile extends ProfileShape {
  kind: 'grow-profile';
  id: string;
  partId: string;
  parentId: string;
  face: Face;
  fromEnd: ParentEnd;
  /** From `fromEnd` along the parent; always 0 on an end face. */
  alongMm: number;
  /** Off the center of the face, towards + on the axis across it; always 0 on an end face. */
  acrossMm: number;
  /**
   * 'out' grows out of the face, perpendicular to it; a direction along the face lays the
   * profile on it, running that way.
   */
  way: GrowthWay;
  /**
   * For a span, the part whose facing face its free end meets: its length is then the gap to it,
   * and `lengthMm` the length it last took, kept when the faces stop facing each other.
   */
  reachesId?: string;
}

export type GrowthWay = 'out' | Face;

/**
 * Removes a part from that step on: the parts that hang from it are anchored where they are, and
 * a span that reached it keeps its length with an open end. Earlier steps still have the part.
 */
export interface RemovePart {
  kind: 'remove-part';
  id: string;
  removedId: string;
}

/** An operation that makes a part. */
export type MakingOperation = AddAnchoredProfile | GrowProfile;

/** One step of a design history. Every kind is part of the file format. */
export type Operation = MakingOperation | RemovePart;

export const makesAPart = (operation: Operation): operation is MakingOperation =>
  operation.kind !== 'remove-part';

/** The values the inspector edits; each kind of operation takes the ones that place it. */
export interface ProfileValues {
  name: string;
  sectionId: string;
  axis: Axis;
  heightAxis: Axis;
  lengthMm: number;
  startMm: Vec3Mm;
  face: Face;
  fromEnd: ParentEnd;
  alongMm: number;
  acrossMm: number;
  way: GrowthWay;
  /** The part a span reaches, or null to let its end go, keeping its length. */
  reachesId: string | null;
}

/** Shorter pieces are spacers rather than profiles. */
export const MIN_PROFILE_LENGTH_MM = 10;
/** Longer than any profile of a compact cockpit; it keeps a mistyped length out of the design. */
export const MAX_PROFILE_LENGTH_MM = 3000;
/** How far from the cockpit origin a part can start; it keeps mistyped positions out. */
export const MAX_POSITION_MM = 3000;
/** Part names, like furniture names, are short labels. */
export const MAX_PART_NAME_LENGTH = 45;

export const AXES: readonly Axis[] = ['x', 'y', 'z'];
export const FACES: readonly Face[] = ['+y', '-y', '+x', '-x', '+z', '-z'];

/** The axis a profile's length runs along. */
export const lengthAxisOf = (operation: MakingOperation): Axis =>
  operation.kind === 'add-anchored-profile'
    ? operation.axis
    : faceAxis(operation.way === 'out' ? operation.face : operation.way);

/** The part an operation makes, placed as its values say. */
export function partMadeBy(operation: MakingOperation): ProfilePart {
  const profile = {
    kind: 'profile' as const,
    id: operation.partId,
    name: operation.name,
    systemId: operation.systemId,
    sectionId: operation.sectionId,
    axis: lengthAxisOf(operation),
    heightAxis: operation.heightAxis,
    lengthMm: operation.lengthMm,
  };
  if (operation.kind === 'add-anchored-profile')
    return { ...profile, placement: { kind: 'anchor', startMm: { ...operation.startMm } } };
  const attachment = {
    parentId: operation.parentId,
    face: operation.face,
    alongMm: operation.alongMm,
    fromEnd: operation.fromEnd,
    acrossMm: operation.acrossMm,
  };
  if (operation.reachesId !== undefined)
    return {
      ...profile,
      placement: { kind: 'span', ...attachment, reachesId: operation.reachesId },
    };
  return {
    ...profile,
    placement: {
      kind: 'attachment',
      ...attachment,
      ...(operation.way === 'out' ? {} : { lying: operation.way }),
    },
  };
}

/** The operation that made a part, if the history made it. */
export function operationMaking(
  history: readonly Operation[],
  partId: string,
): MakingOperation | undefined {
  return history.filter(makesAPart).find((operation) => operation.partId === partId);
}

/** The operation as given, or an error naming the first value it cannot have. */
export function checkedOperation<T extends Operation>(operation: T): T {
  if (operation.kind === 'remove-part') {
    if (typeof operation.removedId !== 'string' || operation.removedId === '')
      throw new Error('A removal needs the part it removes');
    return operation;
  }
  const system = profileSystem(operation.systemId);
  if (!system.sections.some((section) => section.id === operation.sectionId))
    throw new Error(`Profile section ${operation.sectionId} is not in ${system.id}.`);
  if (operation.kind === 'add-anchored-profile' && !AXES.includes(operation.axis))
    throw new Error(`Unknown axis: ${operation.axis}`);
  if (operation.kind === 'grow-profile') checkGrowth(operation);
  if (!AXES.includes(operation.heightAxis) || operation.heightAxis === lengthAxisOf(operation))
    throw new Error(`A section height along ${operation.heightAxis} does not fit the profile.`);
  const { lengthMm } = operation;
  if (
    !Number.isFinite(lengthMm) ||
    lengthMm < MIN_PROFILE_LENGTH_MM ||
    lengthMm > MAX_PROFILE_LENGTH_MM
  )
    throw new Error(
      `A profile length must be between ${MIN_PROFILE_LENGTH_MM} and ${MAX_PROFILE_LENGTH_MM} mm.`,
    );
  if (operation.kind === 'add-anchored-profile') checkStart(operation.startMm);
  return operation;
}

function checkStart(startMm: Vec3Mm) {
  if (
    !AXES.every(
      (axis) => Number.isFinite(startMm[axis]) && Math.abs(startMm[axis]) <= MAX_POSITION_MM,
    )
  )
    throw new Error(`A position must be within ${MAX_POSITION_MM} mm of the cockpit origin.`);
}

function checkGrowth(operation: GrowProfile) {
  if (!FACES.includes(operation.face)) throw new Error(`Unknown face: ${operation.face}`);
  if (operation.fromEnd !== 'start' && operation.fromEnd !== 'end')
    throw new Error(`Unknown end: ${operation.fromEnd}`);
  const { way } = operation;
  if (way !== 'out' && !FACES.includes(way)) throw new Error(`Unknown way to grow: ${way}`);
  if (way !== 'out' && faceAxis(way) === faceAxis(operation.face))
    throw new Error(
      'A profile lying on a face runs along it: choose a way across the face, or out of it.',
    );
  if (operation.reachesId !== undefined && way !== 'out')
    throw new Error('A profile lying on a face cannot reach another part: it lies along the face.');
  if (!Number.isFinite(operation.alongMm) || operation.alongMm < 0)
    throw new Error('A distance along a part must be 0 mm or more.');
  if (!Number.isFinite(operation.acrossMm))
    throw new Error('An offset across a face must be a number of mm.');
}
