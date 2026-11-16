// The design history: the ordered operations that build a cockpit design, and replaying them
// into parts (docs/adr/0005). Editing a part changes the values of the operation that made it,
// so the history stays the only record of the design. Lengths are in mm.
import { cleanUserText } from '../user-text.ts';
import { cornersMm, resolveAssembly, type Axis, type Part, type Vec3Mm } from './assembly.ts';
import { MOTEDIS_SERIES_40_SLOT_8, profileSection, profileSystem } from './catalog.ts';

/** What a profile is made with: the values the inspector edits. */
export interface ProfileValues {
  name: string;
  sectionId: string;
  /** The axis its length runs along. */
  axis: Axis;
  /** The axis its section's height runs along; never its length axis. */
  heightAxis: Axis;
  lengthMm: number;
  /** The center of its section at its start, the end with the lower coordinate. */
  startMm: Vec3Mm;
}

/** Adds a profile placed on its own, hanging from no other part. */
export interface AddAnchoredProfile extends ProfileValues {
  kind: 'add-anchored-profile';
  id: string;
  /** The part it makes; the identifier stays the same every time the history is replayed. */
  partId: string;
  systemId: string;
}

/** One step of a design history. Every kind is part of the file format. */
export type Operation = AddAnchoredProfile;

/** Shorter pieces are spacers rather than profiles. */
export const MIN_PROFILE_LENGTH_MM = 10;
/** Longer than any profile of a compact cockpit; it keeps a mistyped length out of the design. */
export const MAX_PROFILE_LENGTH_MM = 3000;
/** How far from the cockpit origin a part can start; it keeps mistyped positions out. */
export const MAX_POSITION_MM = 3000;
/** Part names, like furniture names, are short labels. */
export const MAX_PART_NAME_LENGTH = 45;

const AXES: readonly Axis[] = ['x', 'y', 'z'];

/** A new profile is a 40 × 40 lying on the floor, front to back, half a metre long. */
const NEW_PROFILE = {
  system: MOTEDIS_SERIES_40_SLOT_8,
  sectionId: '40x40',
  axis: 'z',
  heightAxis: 'y',
  lengthMm: 500,
} as const;
/** The gap left between a new profile and the parts beside it, so they don't touch. */
const NEW_PROFILE_GAP_MM = 60;

/** Replays the history into the parts it makes, in order. */
export function replayHistory(history: readonly Operation[]): Part[] {
  return history.map((operation) => ({
    kind: 'profile',
    id: operation.partId,
    name: operation.name,
    systemId: operation.systemId,
    sectionId: operation.sectionId,
    axis: operation.axis,
    heightAxis: operation.heightAxis,
    lengthMm: operation.lengthMm,
    placement: { kind: 'anchor', startMm: { ...operation.startMm } },
  }));
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
  const { system, sectionId, axis, heightAxis, lengthMm } = NEW_PROFILE;
  const section = profileSection(system, sectionId);
  const partId = `part-${nextNumber(
    'part',
    history.map((operation) => operation.partId),
  )}`;
  const operation: AddAnchoredProfile = {
    kind: 'add-anchored-profile',
    id: `op-${nextNumber(
      'op',
      history.map((existing) => existing.id),
    )}`,
    partId,
    name: `${section.widthMm} × ${section.heightMm} profile ${history.length + 1}`,
    systemId: system.id,
    sectionId,
    axis,
    heightAxis,
    lengthMm,
    startMm: { x: besideTheDesignMm(history, section.widthMm), y: section.heightMm / 2, z: 0 },
  };
  return { history: [...history, operation], partId };
}

/**
 * Changes the values of the operation that made a part. Turning a profile to run along its
 * section's height turns the section with it, as a quarter turn would.
 */
export function editProfile(
  history: readonly Operation[],
  partId: string,
  changes: Partial<ProfileValues>,
): Operation[] {
  const operation = operationMaking(history, partId);
  if (!operation) throw new Error(`Part ${partId} is not in the design history.`);
  const axis = changes.axis ?? operation.axis;
  const turnedHeightAxis = operation.heightAxis === axis ? operation.axis : operation.heightAxis;
  const edited = checkedOperation({
    ...operation,
    ...changes,
    name: cleanUserText(changes.name, operation.name, MAX_PART_NAME_LENGTH),
    heightAxis: changes.heightAxis ?? turnedHeightAxis,
  });
  return history.map((existing) => (existing === operation ? edited : existing));
}

/** The operation as given, or an error naming the first value it cannot have. */
export function checkedOperation(operation: AddAnchoredProfile): AddAnchoredProfile {
  const system = profileSystem(operation.systemId);
  if (!system.sections.some((section) => section.id === operation.sectionId))
    throw new Error(`Profile section ${operation.sectionId} is not in ${system.id}.`);
  if (!AXES.includes(operation.axis)) throw new Error(`Unknown axis: ${operation.axis}`);
  if (!AXES.includes(operation.heightAxis) || operation.heightAxis === operation.axis)
    throw new Error(`A section height along ${operation.heightAxis} does not fit the profile.`);
  const { lengthMm, startMm } = operation;
  if (
    !Number.isFinite(lengthMm) ||
    lengthMm < MIN_PROFILE_LENGTH_MM ||
    lengthMm > MAX_PROFILE_LENGTH_MM
  )
    throw new Error(
      `A profile length must be between ${MIN_PROFILE_LENGTH_MM} and ${MAX_PROFILE_LENGTH_MM} mm.`,
    );
  if (
    !AXES.every(
      (axis) => Number.isFinite(startMm[axis]) && Math.abs(startMm[axis]) <= MAX_POSITION_MM,
    )
  )
    throw new Error(`A position must be within ${MAX_POSITION_MM} mm of the cockpit origin.`);
  return operation;
}

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
  const corners = [...resolveAssembly(replayHistory(history)).values()].flatMap(cornersMm);
  return Math.max(...corners.map((corner) => corner.x)) + NEW_PROFILE_GAP_MM + widthMm / 2;
}
