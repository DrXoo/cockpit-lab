// The design history: the ordered operations that build a cockpit design, and replaying them
// into parts (docs/adr/0005). Editing a part changes the values of the operation that made it,
// so the history stays the only record of the design. Lengths are in mm.
import { cleanUserText } from '../user-text.ts';
import {
  cornersMm,
  faceAxis,
  resolveAssembly,
  type Axis,
  type Face,
  type Part,
  type ProfilePart,
  type ResolvedPart,
  type Vec3Mm,
} from './assembly.ts';
import { MOTEDIS_SERIES_40_SLOT_8, profileSection, profileSystem } from './catalog.ts';

/** What every profile is made with, wherever it is placed. */
interface ProfileShape {
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
}

export type GrowthWay = 'out' | Face;

/** One step of a design history. Every kind is part of the file format. */
export type Operation = AddAnchoredProfile | GrowProfile;

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
}

/** Shorter pieces are spacers rather than profiles. */
export const MIN_PROFILE_LENGTH_MM = 10;
/** Longer than any profile of a compact cockpit; it keeps a mistyped length out of the design. */
export const MAX_PROFILE_LENGTH_MM = 3000;
/** How far from the cockpit origin a part can start; it keeps mistyped positions out. */
export const MAX_POSITION_MM = 3000;
/** Part names, like furniture names, are short labels. */
export const MAX_PART_NAME_LENGTH = 45;

const AXES: readonly Axis[] = ['x', 'y', 'z'];
export const FACES: readonly Face[] = ['+y', '-y', '+x', '-x', '+z', '-z'];

/** Values only an anchored profile has, and only a grown one has. */
const ANCHORED_ONLY: readonly (keyof ProfileValues)[] = ['axis', 'startMm'];
const GROWN_ONLY: readonly (keyof ProfileValues)[] = [
  'face',
  'fromEnd',
  'alongMm',
  'acrossMm',
  'way',
];

/** A new profile is a 40 × 40, half a metre long. */
const NEW_PROFILE = {
  system: MOTEDIS_SERIES_40_SLOT_8,
  sectionId: '40x40',
  lengthMm: 500,
} as const;
/** An anchored one lies on the floor, front to back. */
const NEW_ANCHORED = { axis: 'z', heightAxis: 'y' } as const;
/** The gap left between a new profile and the parts beside it, so they don't touch. */
const NEW_PROFILE_GAP_MM = 60;

/** The axis a profile's length runs along. */
export const lengthAxisOf = (operation: Operation): Axis =>
  operation.kind === 'add-anchored-profile'
    ? operation.axis
    : faceAxis(operation.way === 'out' ? operation.face : operation.way);

/** Replays the history into the parts it makes, in order. */
export function replayHistory(history: readonly Operation[]): Part[] {
  return history.map(partMadeBy);
}

function partMadeBy(operation: Operation): ProfilePart {
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
  return {
    ...profile,
    placement: {
      kind: 'attachment',
      parentId: operation.parentId,
      face: operation.face,
      alongMm: operation.alongMm,
      fromEnd: operation.fromEnd,
      acrossMm: operation.acrossMm,
      ...(operation.way === 'out' ? {} : { lying: operation.way }),
    },
  };
}

/** The operation that made a part, if the history made it. */
export function operationMaking(
  history: readonly Operation[],
  partId: string,
): Operation | undefined {
  return history.find((operation) => operation.partId === partId);
}

/** Adds an anchored profile at the end of the history, beside the parts the design has. */
export function addAnchoredProfile(history: readonly Operation[]): {
  history: Operation[];
  partId: string;
} {
  const { system, sectionId, lengthMm } = NEW_PROFILE;
  const section = profileSection(system, sectionId);
  const operation: AddAnchoredProfile = {
    kind: 'add-anchored-profile',
    ...nextIdentifiers(history),
    name: newProfileName(history, section.widthMm, section.heightMm),
    systemId: system.id,
    sectionId,
    ...NEW_ANCHORED,
    lengthMm,
    startMm: { x: besideTheDesignMm(history, section.widthMm), y: section.heightMm / 2, z: 0 },
  };
  return { history: [...history, operation], partId: operation.partId };
}

/**
 * A profile ready to grow out of a part, not yet in the history: from the middle of the part's
 * top, or of its front when the top is an end.
 */
export function draftGrowth(history: readonly Operation[], parentId: string): GrowProfile {
  const parent = operationMaking(history, parentId);
  if (!parent) throw new Error(`Part ${parentId} is not in the design history.`);
  const resolved = resolvedParts(history).get(parentId);
  if (!resolved) throw new Error(`Part ${parentId} is not in the design history.`);
  const { system, sectionId, lengthMm } = NEW_PROFILE;
  const section = profileSection(system, sectionId);
  const face: Face = lengthAxisOf(parent) === 'y' ? '+z' : '+y';
  return {
    kind: 'grow-profile',
    ...nextIdentifiers(history),
    name: newProfileName(history, section.widthMm, section.heightMm),
    systemId: system.id,
    sectionId,
    heightAxis: lengthAxisOf(parent),
    lengthMm,
    parentId,
    face,
    fromEnd: 'start',
    alongMm: Math.round(resolved.lengthMm / 2),
    acrossMm: 0,
    way: 'out',
  };
}

/**
 * The growth moved to a face of its parent, at a point clicked on it: the distance is measured
 * from the nearer end, in whole mm, and the growth stays on the middle of the face, where the
 * slot of a profile is. The point is in the parent's frame.
 */
export function growthAt(
  history: readonly Operation[],
  draft: GrowProfile,
  face: Face,
  pointMm: Vec3Mm,
): GrowProfile {
  const parent = resolvedParts(history).get(draft.parentId);
  if (!parent || parent.part.kind !== 'profile')
    throw new Error(`${draft.name} has no profile to grow from.`);
  const axis = parent.part.axis;
  const fromStartMm = Math.round(pointMm[axis] - parent.box.min[axis]);
  const lengthMm = Math.round(parent.lengthMm);
  const nearerEnd: ParentEnd = fromStartMm > lengthMm / 2 ? 'end' : 'start';
  const alongMm = nearerEnd === 'start' ? fromStartMm : lengthMm - fromStartMm;
  return editDraft(history, draft, {
    face,
    fromEnd: nearerEnd,
    alongMm: Math.min(Math.max(alongMm, 0), lengthMm),
    acrossMm: 0,
  });
}

/** Adds an operation at the end of the history, once it fits there. */
export function addOperation(history: readonly Operation[], operation: Operation): Operation[] {
  return checkedHistory([...history, onItsFace(history, checkedOperation(operation))]);
}

/**
 * Changes the values of the operation that made a part. Turning a profile to run along its
 * section's height turns the section with it, as a quarter turn would. The parts that hang from
 * it must still fit where they hang.
 */
export function editProfile(
  history: readonly Operation[],
  partId: string,
  changes: Partial<ProfileValues>,
): Operation[] {
  const operation = operationMaking(history, partId);
  if (!operation) throw new Error(`Part ${partId} is not in the design history.`);
  const edited = editedOperation(history, operation, changes);
  return checkedHistory(history.map((existing) => (existing === operation ? edited : existing)));
}

/** A growth not yet in the history, with the changes made to it as an edit would make them. */
export function editDraft(
  history: readonly Operation[],
  draft: GrowProfile,
  changes: Partial<ProfileValues>,
): GrowProfile {
  const edited = editedGrowth(history, draft, withCleanName(draft, changes));
  return checkedOperation(turnedSection(draft, edited, changes.heightAxis));
}

function editedOperation(
  history: readonly Operation[],
  operation: Operation,
  changes: Partial<ProfileValues>,
): Operation {
  const named = withCleanName(operation, changes);
  const edited: Operation =
    operation.kind === 'add-anchored-profile'
      ? editedAnchored(operation, named)
      : editedGrowth(history, operation, named);
  return checkedOperation(turnedSection(operation, edited, changes.heightAxis));
}

/** A typed name is cleaned; one left empty keeps the name the part had. */
const withCleanName = (
  operation: Operation,
  changes: Partial<ProfileValues>,
): Partial<ProfileValues> => ({
  ...changes,
  name: cleanUserText(changes.name, operation.name, MAX_PART_NAME_LENGTH),
});

function editedAnchored(
  operation: AddAnchoredProfile,
  changes: Partial<ProfileValues>,
): AddAnchoredProfile {
  const misplaced = GROWN_ONLY.find((key) => changes[key] !== undefined);
  if (misplaced) throw new Error(`An anchored profile has no ${misplaced} to change.`);
  return {
    ...operation,
    ...shapeChanges(operation, changes),
    axis: changes.axis ?? operation.axis,
    startMm: changes.startMm ?? operation.startMm,
  };
}

function editedGrowth(
  history: readonly Operation[],
  operation: GrowProfile,
  changes: Partial<ProfileValues>,
): GrowProfile {
  if (ANCHORED_ONLY.some((key) => changes[key] !== undefined))
    throw new Error(
      `${operation.name} takes its position from ${nameOf(history, operation.parentId)}: change where it grows from instead.`,
    );
  const face = changes.face ?? operation.face;
  return onItsFace(history, {
    ...operation,
    ...shapeChanges(operation, changes),
    face,
    fromEnd: changes.fromEnd ?? operation.fromEnd,
    alongMm: changes.alongMm ?? operation.alongMm,
    acrossMm: changes.acrossMm ?? operation.acrossMm,
    way: changes.way ?? keptLying(history, operation, face),
  });
}

/**
 * The way a profile lying on a face runs once it moves to `face`. On a face across its way it
 * turns to lie along the part it grows from, or along another axis of the face.
 */
function keptLying(history: readonly Operation[], operation: GrowProfile, face: Face): GrowthWay {
  const { way } = operation;
  if (way === 'out' || faceAxis(way) !== faceAxis(face)) return way;
  const parent = operationMaking(history, operation.parentId);
  const parentAxis = parent ? lengthAxisOf(parent) : 'z';
  const axis =
    parentAxis !== faceAxis(face)
      ? parentAxis
      : (AXES.find((candidate) => candidate !== faceAxis(face)) ?? 'z');
  return `+${axis}`;
}

/** The shape of a profile with the changes given, keeping the values not given. */
function shapeChanges(operation: Operation, changes: Partial<ProfileValues>): ProfileShape {
  return {
    name: changes.name ?? operation.name,
    systemId: operation.systemId,
    sectionId: changes.sectionId ?? operation.sectionId,
    heightAxis: changes.heightAxis ?? operation.heightAxis,
    lengthMm: changes.lengthMm ?? operation.lengthMm,
  };
}

/** A section whose height would run along the new length turns a quarter, onto the old one. */
function turnedSection<T extends Operation>(
  before: Operation,
  after: T,
  heightAxisAsked: Axis | undefined,
): T {
  if (heightAxisAsked !== undefined || after.heightAxis !== lengthAxisOf(after)) return after;
  const oldAxis = lengthAxisOf(before);
  const heightAxis =
    oldAxis !== lengthAxisOf(after)
      ? oldAxis
      : (AXES.find((axis) => axis !== lengthAxisOf(after)) ?? 'y');
  return { ...after, heightAxis };
}

/** An end face has a single place to grow from, its center. */
function onItsFace<T extends Operation>(history: readonly Operation[], operation: T): T {
  if (operation.kind !== 'grow-profile') return operation;
  const parent = operationMaking(history, operation.parentId);
  if (!parent || lengthAxisOf(parent) !== faceAxis(operation.face)) return operation;
  return { ...operation, alongMm: 0, acrossMm: 0 };
}

/** The operation as given, or an error naming the first value it cannot have. */
export function checkedOperation<T extends Operation>(operation: T): T {
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
  if (!Number.isFinite(operation.alongMm) || operation.alongMm < 0)
    throw new Error('A distance along a part must be 0 mm or more.');
  if (!Number.isFinite(operation.acrossMm))
    throw new Error('An offset across a face must be a number of mm.');
}

/**
 * The history as given, once every operation refers to parts made before it and every grown
 * profile stays on the face it grows from. The error names the parts that don't fit.
 */
export function checkedHistory(history: readonly Operation[]): Operation[] {
  const made = new Set<string>();
  for (const operation of history) {
    if (operation.kind === 'grow-profile' && !made.has(operation.parentId))
      throw new Error(`${operation.name} grows from ${operation.parentId}, made no earlier.`);
    made.add(operation.partId);
  }
  const resolved = resolvedParts(history);
  for (const operation of history)
    if (operation.kind === 'grow-profile') checkOnItsFace(operation, resolved);
  return [...history];
}

function checkOnItsFace(operation: GrowProfile, resolved: ReadonlyMap<string, ResolvedPart>) {
  const parent = resolved.get(operation.parentId);
  const parentPart = parent?.part;
  if (!parent || parentPart?.kind !== 'profile') return;
  const normal = faceAxis(operation.face);
  if (normal === parentPart.axis) return;
  const across = AXES.find((axis) => axis !== normal && axis !== parentPart.axis) ?? 'y';
  const faceWidthMm = parent.box.max[across] - parent.box.min[across];
  const lengthMm = Math.round(parent.lengthMm);
  if (operation.alongMm > parent.lengthMm)
    throw new Error(
      `${operation.name} would hang off ${parentPart.name}: ${operation.alongMm} mm along it is more than its ${lengthMm} mm length.`,
    );
  if (Math.abs(operation.acrossMm) > faceWidthMm / 2)
    throw new Error(
      `${operation.name} would hang off the side of ${parentPart.name}: an offset of ${Math.abs(operation.acrossMm)} mm is more than half its ${faceWidthMm} mm face.`,
    );
}

const resolvedParts = (history: readonly Operation[]) => resolveAssembly(replayHistory(history));

function nameOf(history: readonly Operation[], partId: string): string {
  return operationMaking(history, partId)?.name ?? partId;
}

function nextIdentifiers(history: readonly Operation[]): { id: string; partId: string } {
  return {
    id: `op-${nextNumber(
      'op',
      history.map((operation) => operation.id),
    )}`,
    partId: `part-${nextNumber(
      'part',
      history.map((operation) => operation.partId),
    )}`,
  };
}

/** Named after the section and the step that makes it, such as "40 × 40 profile 3". */
const newProfileName = (history: readonly Operation[], widthMm: number, heightMm: number) =>
  `${widthMm} × ${heightMm} profile ${history.length + 1}`;

/** One more than the highest number of the identifiers made with `prefix`. */
function nextNumber(prefix: string, ids: readonly string[]): number {
  const numbers = ids
    .filter((id) => id.startsWith(`${prefix}-`))
    .map((id) => id.slice(prefix.length + 1))
    .filter((digits) => /^\d+$/.test(digits))
    .map(Number);
  return Math.max(0, ...numbers) + 1;
}

/** The X of a new profile's center, beside every part of the design on its +X side. */
function besideTheDesignMm(history: readonly Operation[], widthMm: number): number {
  if (history.length === 0) return 0;
  const corners = [...resolvedParts(history).values()].flatMap(cornersMm);
  return Math.max(...corners.map((corner) => corner.x)) + NEW_PROFILE_GAP_MM + widthMm / 2;
}
