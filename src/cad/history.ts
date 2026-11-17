// Changing a design history: adding and growing profiles, editing the operation that made a
// part, and checking that the history still fits together (docs/adr/0005). Editing a part
// changes the values of the operation that made it, so the history stays the only record of the
// design. The operations themselves are in operations.ts. Lengths are in mm.
import { cleanUserText } from '../user-text.ts';
import {
  cornersMm,
  faceAxis,
  gapTo,
  type Axis,
  type Face,
  type ResolvedPart,
  type Vec3Mm,
} from './assembly.ts';
import { footType, MOTEDIS_SERIES_40_SLOT_8, profileSection } from './catalog.ts';
import { replayDesign } from './replay.ts';
import {
  AXES,
  checkedOperation,
  makesAPart,
  makesAProfile,
  lengthAxisOf,
  MAX_PART_NAME_LENGTH,
  MAX_PROFILE_LENGTH_MM,
  MIN_PROFILE_LENGTH_MM,
  operationMaking,
  type AddAnchoredProfile,
  type AddFoot,
  type FootValues,
  type GrowProfile,
  type GrowthWay,
  type MakingOperation,
  type Operation,
  type ParentEnd,
  type ProfileOperation,
  type ProfileShape,
  type ProfileValues,
  type RemovePart,
} from './operations.ts';

export * from './operations.ts';
export { replayDesign, replayHistory, type ReplayedDesign } from './replay.ts';

/** Values only an anchored profile has, and only a grown one has. */
const ANCHORED_ONLY: readonly (keyof ProfileValues)[] = ['axis', 'startMm'];
const GROWN_ONLY: readonly (keyof ProfileValues)[] = [
  'face',
  'fromEnd',
  'alongMm',
  'acrossMm',
  'way',
  'reachesId',
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

/**
 * Adds an anchored profile at step `at`, the history marker, beside the parts the design has
 * there. The marker is at the end unless it was moved back.
 */
export function addAnchoredProfile(
  history: readonly Operation[],
  at: number = history.length,
): {
  history: Operation[];
  partId: string;
} {
  const { system, sectionId, lengthMm } = NEW_PROFILE;
  const section = profileSection(system, sectionId);
  const operation: AddAnchoredProfile = {
    kind: 'add-anchored-profile',
    ...nextIdentifiers(history),
    name: newProfileName(at, section.widthMm, section.heightMm),
    systemId: system.id,
    sectionId,
    ...NEW_ANCHORED,
    lengthMm,
    startMm: {
      x: besideTheDesignMm(history, at, section.widthMm),
      y: section.heightMm / 2,
      z: 0,
    },
  };
  return { history: addOperation(history, operation, at), partId: operation.partId };
}

/**
 * A profile ready to grow out of a part, not yet in the history: from the middle of the part's
 * top, or of its front when the top is an end.
 */
export function draftGrowth(
  history: readonly Operation[],
  parentId: string,
  at: number = history.length,
): GrowProfile {
  const parent = operationMaking(history, parentId);
  const resolved = replayDesign(history, at).resolved.get(parentId);
  if (!parent || !resolved) throw new Error(`Part ${parentId} is not in the design at this step.`);
  if (!makesAProfile(parent))
    throw new Error(`Nothing grows out of ${parent.name}: a profile only grows out of a profile.`);
  const { system, sectionId, lengthMm } = NEW_PROFILE;
  const section = profileSection(system, sectionId);
  const face: Face = lengthAxisOf(parent) === 'y' ? '+z' : '+y';
  return {
    kind: 'grow-profile',
    ...nextIdentifiers(history),
    name: newProfileName(at, section.widthMm, section.heightMm),
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
  at: number = history.length,
): GrowProfile {
  const parent = replayDesign(history, at).resolved.get(draft.parentId);
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

/** Adds an operation at step `at`, the history marker, once it applies there. */
export function addOperation(
  history: readonly Operation[],
  operation: Operation,
  at: number = history.length,
): Operation[] {
  const checked = checkedOperation(operation);
  const added =
    checked.kind === 'grow-profile'
      ? onItsFace(history, checked)
      : checked.kind === 'add-foot'
        ? footOnItsFace(history, checked)
        : checked;
  const inserted = [...history.slice(0, at), added, ...history.slice(at)];
  return refusedIfItFails(checkedHistory(inserted), added.id);
}

/** A new foot is a leveling foot. */
const NEW_FOOT_TYPE_ID = 'leveling-foot';

/**
 * Adds a foot under a profile at step `at`, the history marker: under the end that has fewer
 * feet, flush with it, so the first two go under both ends.
 */
export function addFoot(
  history: readonly Operation[],
  parentId: string,
  at: number = history.length,
): { history: Operation[]; partId: string } {
  const parent = replayDesign(history, at).resolved.get(parentId);
  if (!parent) throw new Error(`Part ${parentId} is not in the design at this step.`);
  if (parent.part.kind !== 'profile')
    throw new Error(`A foot goes under a profile, and ${parent.part.name} is not one.`);
  const type = footType(NEW_FOOT_TYPE_ID);
  const feetUnder = (end: ParentEnd) =>
    history.filter(
      (operation) =>
        operation.kind === 'add-foot' &&
        operation.parentId === parentId &&
        operation.fromEnd === end,
    ).length;
  const halfAlongMm: Record<Axis, number> = { x: type.widthMm / 2, y: 0, z: type.depthMm / 2 };
  const foot: AddFoot = {
    kind: 'add-foot',
    ...nextIdentifiers(history),
    name: `${type.name} ${at + 1}`,
    footTypeId: type.id,
    parentId,
    fromEnd: feetUnder('end') < feetUnder('start') ? 'end' : 'start',
    alongMm: halfAlongMm[parent.part.axis],
  };
  return { history: addOperation(history, foot, at), partId: foot.partId };
}

/** Changes the values of the operation that put a foot under a profile. */
export function editFoot(
  history: readonly Operation[],
  partId: string,
  changes: Partial<FootValues>,
): Operation[] {
  const operation = operationMaking(history, partId);
  if (!operation) throw new Error(`Part ${partId} is not in the design history.`);
  if (operation.kind !== 'add-foot') throw new Error(`${operation.name} is not a foot.`);
  const named = withCleanName(operation, changes);
  const edited = footOnItsFace(
    history,
    checkedOperation({
      ...operation,
      name: named.name ?? operation.name,
      footTypeId: changes.footTypeId ?? operation.footTypeId,
      fromEnd: changes.fromEnd ?? operation.fromEnd,
      alongMm: changes.alongMm ?? operation.alongMm,
    }),
  );
  const changed = checkedHistory(
    history.map((existing) => (existing === operation ? edited : existing)),
  );
  const failedBefore = replayDesign(history).failures.has(operation.id);
  return failedBefore ? changed : refusedIfItFails(changed, operation.id);
}

/**
 * Removes a part from step `at` on, as an operation: the parts that hang from it are anchored
 * where they are, and spans that reached it keep their length with an open end.
 */
export function removePart(
  history: readonly Operation[],
  partId: string,
  at: number = history.length,
): Operation[] {
  if (!replayDesign(history, at).resolved.has(partId))
    throw new Error(`Part ${partId} is not in the design at this step.`);
  const removal: RemovePart = {
    kind: 'remove-part',
    id: nextIdentifiers(history).id,
    removedId: partId,
  };
  return addOperation(history, removal, at);
}

/**
 * Takes an operation and what it made out of the whole history. The operations that relied on
 * it fail; the others still apply.
 */
export function deleteOperation(history: readonly Operation[], operationId: string): Operation[] {
  if (!history.some((operation) => operation.id === operationId))
    throw new Error(`Operation ${operationId} is not in the design history.`);
  return checkedHistory(history.filter((operation) => operation.id !== operationId));
}

/**
 * Puts an edited operation in the place of the one with its id. The edit is refused when it
 * would make the operation fail, unless it had failed already and is being fixed.
 */
export function changeOperation(history: readonly Operation[], edited: Operation): Operation[] {
  const checked = checkedOperation(edited);
  const changed = checkedHistory(
    history.map((existing) => (existing.id === checked.id ? checked : existing)),
  );
  const failedBefore = replayDesign(history).failures.has(checked.id);
  return failedBefore ? changed : refusedIfItFails(changed, checked.id);
}

/** The history, unless the operation would fail in it: then the reason it would fail. */
function refusedIfItFails(history: Operation[], operationId: string): Operation[] {
  const failure = replayDesign(history).failures.get(operationId);
  if (failure !== undefined) throw new Error(failure);
  return history;
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
  if (!makesAProfile(operation))
    throw new Error(`${operation.name} is not a profile: it has no profile values to change.`);
  const edited = editedOperation(history, operation, changes);
  const changed = checkedHistory(
    history.map((existing) => (existing === operation ? edited : existing)),
  );
  // An edit can't make its operation fail, but a failed one can still be edited to fix it.
  const failedBefore = replayDesign(history).failures.has(operation.id);
  return failedBefore ? changed : refusedIfItFails(changed, operation.id);
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
  operation: ProfileOperation,
  changes: Partial<ProfileValues>,
): ProfileOperation {
  const named = withCleanName(operation, changes);
  const edited: ProfileOperation =
    operation.kind === 'add-anchored-profile'
      ? editedAnchored(operation, named)
      : editedGrowth(history, operation, named);
  return checkedOperation(turnedSection(operation, edited, changes.heightAxis));
}

/** A typed name is cleaned; one left empty keeps the name the part had. */
const withCleanName = <T extends { name?: string }>(operation: MakingOperation, changes: T): T => ({
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
  const reachesId =
    changes.reachesId === undefined ? operation.reachesId : (changes.reachesId ?? undefined);
  if (
    operation.reachesId !== undefined &&
    reachesId !== undefined &&
    changes.lengthMm !== undefined &&
    changes.lengthMm !== operation.lengthMm
  )
    throw new Error(
      `${operation.name} takes its length from the gap to ${nameOf(history, operation.reachesId)}: let its end go to give it a length.`,
    );
  if (typeof changes.reachesId === 'string' && changes.reachesId !== operation.reachesId)
    checkReach(history, operation, changes.reachesId);
  const face = changes.face ?? operation.face;
  const edited = onItsFace(history, {
    kind: operation.kind,
    id: operation.id,
    partId: operation.partId,
    parentId: operation.parentId,
    ...shapeChanges(operation, changes),
    face,
    fromEnd: changes.fromEnd ?? operation.fromEnd,
    alongMm: changes.alongMm ?? operation.alongMm,
    acrossMm: changes.acrossMm ?? operation.acrossMm,
    way: changes.way ?? keptLying(history, operation, face),
  });
  return reachesId === undefined ? edited : { ...edited, reachesId };
}

/** A span can only reach a part in front of its free end that does not hang from it. */
function checkReach(history: readonly Operation[], span: GrowProfile, targetId: string) {
  const target = operationMaking(history, targetId);
  if (!target)
    throw new Error(`${span.name} cannot reach ${targetId}, which is not in the design.`);
  if (dependentsOf(history, span.partId).has(targetId))
    throw new Error(`${span.name} cannot reach ${target.name}, which hangs from it.`);
  if (!facingParts(history, span.partId).includes(targetId))
    throw new Error(
      `${span.name} cannot reach ${target.name}: no face of it is in front of its free end.`,
    );
}

/**
 * The parts the free end of a profile grown out of a face can reach, nearest first: their
 * facing face is in front of its end, on its center line, far enough for a profile and at its
 * tilt. Parts that hang from it, directly or through others, are left out.
 */
export function facingParts(history: readonly Operation[], partId: string): string[] {
  const operation = operationMaking(history, partId);
  if (!operation || operation.kind !== 'grow-profile' || operation.way !== 'out') return [];
  const resolved = replayDesign(history).resolved;
  const profile = resolved.get(partId);
  if (!profile) return [];
  const normal = faceAxis(operation.face);
  const { min, max } = profile.box;
  const outwards = operation.face[0] === '+';
  const end: Vec3Mm = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
  end[normal] = outwards ? min[normal] : max[normal];
  const dependents = dependentsOf(history, partId);
  return [...resolved.values()]
    .filter(
      ({ part, tiltDeg }) =>
        part.kind === 'profile' && !dependents.has(part.id) && tiltDeg === profile.tiltDeg,
    )
    .map(({ part, box }) => ({ id: part.id, gapMm: gapTo(box, end, operation.face) }))
    .filter(
      (candidate): candidate is { id: string; gapMm: number } =>
        candidate.gapMm !== null &&
        candidate.gapMm >= MIN_PROFILE_LENGTH_MM &&
        candidate.gapMm <= MAX_PROFILE_LENGTH_MM,
    )
    .sort((a, b) => a.gapMm - b.gapMm)
    .map(({ id }) => id);
}

/** The part and every part that hangs from it or reaches it, directly or through others. */
function dependentsOf(history: readonly Operation[], partId: string): Set<string> {
  const dependents = new Set([partId]);
  let grown = true;
  while (grown) {
    grown = false;
    for (const operation of history.filter(makesAPart)) {
      if (operation.kind === 'add-anchored-profile' || dependents.has(operation.partId)) continue;
      const reached =
        operation.kind === 'grow-profile' &&
        operation.reachesId !== undefined &&
        dependents.has(operation.reachesId);
      if (dependents.has(operation.parentId) || reached) {
        dependents.add(operation.partId);
        grown = true;
      }
    }
  }
  return dependents;
}

/**
 * The way a profile lying on a face runs once it moves to `face`. On a face across its way it
 * turns to lie along the part it grows from, or along another axis of the face.
 */
function keptLying(history: readonly Operation[], operation: GrowProfile, face: Face): GrowthWay {
  const { way } = operation;
  if (way === 'out' || faceAxis(way) !== faceAxis(face)) return way;
  const parent = operationMaking(history, operation.parentId);
  const parentAxis = parent && makesAProfile(parent) ? lengthAxisOf(parent) : 'z';
  const axis =
    parentAxis !== faceAxis(face)
      ? parentAxis
      : (AXES.find((candidate) => candidate !== faceAxis(face)) ?? 'z');
  return `+${axis}`;
}

/** The shape of a profile with the changes given, keeping the values not given. */
function shapeChanges(operation: ProfileOperation, changes: Partial<ProfileValues>): ProfileShape {
  return {
    name: changes.name ?? operation.name,
    systemId: operation.systemId,
    sectionId: changes.sectionId ?? operation.sectionId,
    heightAxis: changes.heightAxis ?? operation.heightAxis,
    lengthMm: changes.lengthMm ?? operation.lengthMm,
  };
}

/** A section whose height would run along the new length turns a quarter, onto the old one. */
function turnedSection<T extends ProfileOperation>(
  before: ProfileOperation,
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
function onItsFace(history: readonly Operation[], operation: GrowProfile): GrowProfile {
  const parent = operationMaking(history, operation.parentId);
  if (!parent || !makesAProfile(parent) || lengthAxisOf(parent) !== faceAxis(operation.face))
    return operation;
  return { ...operation, alongMm: 0, acrossMm: 0 };
}

/** Under an upright, a foot stands under its lower end, the one place there is. */
function footOnItsFace(history: readonly Operation[], foot: AddFoot): AddFoot {
  const parent = operationMaking(history, foot.parentId);
  if (!parent || !makesAProfile(parent) || lengthAxisOf(parent) !== 'y') return foot;
  return { ...foot, alongMm: 0 };
}

/**
 * The history as given, once no span reaches a part that depends on it, with the length each
 * span takes recorded. Operations that refer to parts gone at their step, or no longer fit, are
 * kept: replaying the history marks them as failed.
 */
export function checkedHistory(history: readonly Operation[]): Operation[] {
  for (const operation of history) checkSpanTarget(history, operation);
  return withSpanLengths(history, replayDesign(history).resolved);
}

/** A span cannot reach a part that hangs from it: their places would depend on each other. */
function checkSpanTarget(history: readonly Operation[], operation: Operation) {
  if (operation.kind !== 'grow-profile' || operation.reachesId === undefined) return;
  if (dependentsOf(history, operation.partId).has(operation.reachesId))
    throw new Error(
      `${operation.name} cannot reach ${nameOf(history, operation.reachesId)}, which hangs from it.`,
    );
}

/** Each span that meets its part records the length it takes, to keep if the faces part. */
function withSpanLengths(
  history: readonly Operation[],
  resolved: ReadonlyMap<string, ResolvedPart>,
): Operation[] {
  return history.map((operation) => {
    if (operation.kind !== 'grow-profile' || operation.reachesId === undefined) return operation;
    const span = resolved.get(operation.partId);
    if (!span || span.openEnd || span.lengthMm === operation.lengthMm) return operation;
    return { ...operation, lengthMm: span.lengthMm };
  });
}

function nameOf(history: readonly Operation[], partId: string): string {
  return operationMaking(history, partId)?.name ?? partId;
}

/**
 * The next free identifiers. A part identifier that an operation still refers to stays taken
 * after the operation that made it is deleted, so a new part never answers for it.
 */
export function nextIdentifiers(history: readonly Operation[]): { id: string; partId: string } {
  return {
    id: `op-${nextNumber(
      'op',
      history.map((operation) => operation.id),
    )}`,
    partId: `part-${nextNumber('part', history.flatMap(partIdsNamed))}`,
  };
}

function partIdsNamed(operation: Operation): string[] {
  if (operation.kind === 'remove-part') return [operation.removedId];
  if (operation.kind === 'add-anchored-profile') return [operation.partId];
  if (operation.kind === 'add-foot' || operation.kind === 'add-plate')
    return [operation.partId, operation.parentId];
  if (operation.kind === 'fasten-joint' || operation.kind === 'join-parts')
    return [operation.partId, operation.toPartId];
  return [
    operation.partId,
    operation.parentId,
    ...(operation.reachesId ? [operation.reachesId] : []),
  ];
}

/** Named after the section and the step that makes it, such as "40 × 40 profile 3". */
const newProfileName = (at: number, widthMm: number, heightMm: number) =>
  `${widthMm} × ${heightMm} profile ${at + 1}`;

/** One more than the highest number of the identifiers made with `prefix`. */
function nextNumber(prefix: string, ids: readonly string[]): number {
  const numbers = ids
    .filter((id) => id.startsWith(`${prefix}-`))
    .map((id) => id.slice(prefix.length + 1))
    .filter((digits) => /^\d+$/.test(digits))
    .map(Number);
  return Math.max(0, ...numbers) + 1;
}

/** The X of a new profile's center, beside every part of the design at step `at` on its +X side. */
function besideTheDesignMm(history: readonly Operation[], at: number, widthMm: number): number {
  const parts = [...replayDesign(history, at).resolved.values()];
  if (parts.length === 0) return 0;
  const corners = parts.flatMap(cornersMm);
  return Math.max(...corners.map((corner) => corner.x)) + NEW_PROFILE_GAP_MM + widthMm / 2;
}
