// Mounting peripherals on profiles and plates in a design history (docs/adr/0005): a new
// peripheral ready to mount, one moved to a face clicked in the view, the edits of its step and
// swapping its type. Lengths are in mm.
import { cleanUserText } from '../shared/user-text.ts';
import {
  faceAxis,
  type Axis,
  type ContactPoint,
  type Envelope,
  type Face,
  type ResolvedPart,
  type Vec3Mm,
} from './assembly.ts';
import {
  M8_CLEARANCE_MM,
  peripheralType,
  peripheralTypes,
  type PeripheralType,
} from './catalog.ts';
import {
  changeOperation,
  checkedOperation,
  copiedPeripheral,
  lengthAxisOf,
  makesAProfile,
  MAX_PART_NAME_LENGTH,
  nextIdentifiers,
  operationMaking,
  replayDesign,
  type MountPeripheral,
  type Operation,
  type ParentEnd,
  type PeripheralValues,
  type PeripheralShape,
  type Adjustment,
} from './history.ts';
import type { Hole, MountingPattern } from './plate.ts';
import { adjustmentTurnedWith, withinTravel } from './travel.ts';

/** A peripheral faces the front of the cockpit, as the driver does, unless it cannot. */
const USUAL_FACING: Face = '+z';

/**
 * A peripheral of a catalog type ready to mount on a profile or a plate, not yet in the history:
 * at the middle of a profile's top, or of its front for an upright, or at the center of the face
 * a plate's thickness stands out of, facing the front.
 */
export function draftPeripheral(
  history: readonly Operation[],
  parentId: string,
  typeId: string,
  at: number = history.length,
): MountPeripheral {
  const parent = mountableAt(history, parentId, at);
  const type = peripheralType(typeId);
  const { part } = parent;
  const onAnUpright = alongAxisOf(parent) === 'y';
  const face: Face = part.kind === 'plate' ? part.normal : onAnUpright ? '+z' : '+y';
  const facing = facingAlong(face, USUAL_FACING);
  const adjustment = railsOf(type, facing, undefined);
  return checkedOperation({
    kind: 'mount-peripheral',
    ...nextIdentifiers(history),
    name: type.name,
    typeId: type.id,
    category: type.category,
    ...copiedPeripheral(type),
    parentId,
    face,
    fromEnd: 'start',
    alongMm: Math.round(extentAlong(parent) / 2),
    acrossMm: 0,
    facing,
    ...(adjustment === undefined ? {} : { adjustment }),
  });
}

/**
 * The adjustment a peripheral of `type` takes: a seat's along its rails, the way it faces, at
 * the position it had, brought within them; for a type without rails, the one it had.
 */
function railsOf(
  type: PeripheralType,
  facing: Face,
  had: Adjustment | undefined,
): Adjustment | undefined {
  if (type.railTravelMm === undefined) return had;
  return {
    axis: had?.axis ?? faceAxis(facing),
    travelMm: type.railTravelMm,
    positionMm: withinTravel(had?.positionMm ?? 0, type.railTravelMm),
  };
}

/**
 * The peripheral moved to a face of its part, at a point clicked on it: its origin is measured
 * from the nearer end, in whole mm, and centered across the face. The point is in the part's
 * frame.
 */
export function peripheralAt(
  history: readonly Operation[],
  draft: MountPeripheral,
  face: Face,
  pointMm: Vec3Mm,
  at: number = history.length,
): MountPeripheral {
  const parent = mountableAt(history, draft.parentId, at);
  const axis = alongAxisOf(parent);
  const lengthMm = Math.round(extentAlong(parent));
  const fromStartMm = Math.round(pointMm[axis] - parent.box.min[axis]);
  const nearerEnd: ParentEnd = fromStartMm > lengthMm / 2 ? 'end' : 'start';
  const alongMm = nearerEnd === 'start' ? fromStartMm : lengthMm - fromStartMm;
  return editPeripheralDraft(history, draft, {
    face,
    fromEnd: nearerEnd,
    alongMm: Math.min(Math.max(alongMm, 0), lengthMm),
    acrossMm: 0,
  });
}

/**
 * A peripheral not yet in the history, with the changes made to it as an edit would make them.
 * Moved to a face it would face out of, it turns to face along it; on the end of a profile it
 * goes to its center, the only place there.
 */
export function editPeripheralDraft(
  history: readonly Operation[],
  draft: MountPeripheral,
  changes: Partial<PeripheralValues>,
): MountPeripheral {
  const face = changes.face ?? draft.face;
  const facing = changes.facing ?? facingAlong(face, draft.facing);
  const adjustment = adjustmentTurnedWith(draft.adjustment, draft.facing, face, facing);
  const backrestDeg = changes.backrestDeg ?? draft.backrestDeg;
  const edited: MountPeripheral = {
    ...draft,
    ...copiedPeripheral({
      envelope: changes.envelope ?? draft.envelope,
      mountingPattern: changes.mountingPattern ?? draft.mountingPattern,
      contactPoints: changes.contactPoints ?? draft.contactPoints,
      ...(backrestDeg === undefined ? {} : { backrestDeg }),
      source: draft.source,
    }),
    face,
    fromEnd: changes.fromEnd ?? draft.fromEnd,
    alongMm: changes.alongMm ?? draft.alongMm,
    acrossMm: changes.acrossMm ?? draft.acrossMm,
    name: cleanUserText(changes.name, draft.name, MAX_PART_NAME_LENGTH),
    facing,
    ...(adjustment === undefined ? {} : { adjustment }),
  };
  return checkedOperation(onAnEndAtItsCenter(history, edited));
}

/** Changes the values of the step that mounts a peripheral. */
export function editPeripheral(
  history: readonly Operation[],
  partId: string,
  changes: Partial<PeripheralValues>,
): Operation[] {
  const operation = peripheralStep(history, partId);
  return changeOperation(history, editPeripheralDraft(history, operation, changes));
}

/**
 * Adds a hole to a peripheral's mounting pattern, at its mounting origin and as wide as its last
 * hole, or an M8 clearance hole, the usual bolt of a peripheral, to a pattern without holes.
 */
export function addMountingHole(history: readonly Operation[], partId: string): Operation[] {
  const { holes } = peripheralStep(history, partId).mountingPattern;
  const diameterMm = holes.at(-1)?.diameterMm ?? M8_CLEARANCE_MM;
  const mountingPattern = { holes: [...holes, { xMm: 0, yMm: 0, diameterMm }] };
  return editPeripheral(history, partId, { mountingPattern });
}

/** Takes the hole at `index` out of a peripheral's mounting pattern. */
export function removeMountingHole(
  history: readonly Operation[],
  partId: string,
  index: number,
): Operation[] {
  const operation = peripheralStep(history, partId);
  const { holes } = operation.mountingPattern;
  if (!Number.isInteger(index) || index < 0 || index >= holes.length)
    throw new Error(`${operation.name} has no hole ${index + 1}.`);
  const mountingPattern = { holes: holes.filter((_, holeIndex) => holeIndex !== index) };
  return editPeripheral(history, partId, { mountingPattern });
}

/**
 * Swaps the type of a mounted peripheral: it stays where it is mounted, facing the same way, and
 * takes the values of its new type in place of its own. A name that was its old type's becomes
 * the new type's; a name the user gave it stays.
 */
export function swapPeripheralType(
  history: readonly Operation[],
  partId: string,
  typeId: string,
): Operation[] {
  const operation = peripheralStep(history, partId);
  const type = peripheralType(typeId);
  const adjustment = railsOf(type, operation.facing, operation.adjustment);
  const swapped: MountPeripheral = {
    kind: 'mount-peripheral',
    id: operation.id,
    partId: operation.partId,
    name: hasItsTypeName(operation) ? type.name : operation.name,
    typeId: type.id,
    category: type.category,
    ...copiedPeripheral(type),
    parentId: operation.parentId,
    face: operation.face,
    fromEnd: operation.fromEnd,
    alongMm: operation.alongMm,
    acrossMm: operation.acrossMm,
    facing: operation.facing,
    ...(adjustment === undefined ? {} : { adjustment }),
  };
  return changeOperation(history, checkedOperation(swapped));
}

/**
 * Whether a peripheral's envelope, mounting pattern, contact points or backrest differ from the
 * values of its type, which swapping it would lose. A type that has left the catalog cannot give
 * them back, so its peripherals always differ.
 */
export function differsFromItsType(peripheral: PeripheralShape): boolean {
  const type = peripheralTypes().find((candidate) => candidate.id === peripheral.typeId);
  if (!type) return true;
  return !(
    sameEnvelope(peripheral.envelope, type.envelope) &&
    samePattern(peripheral.mountingPattern, type.mountingPattern) &&
    sameContactPoints(peripheral.contactPoints, type.contactPoints) &&
    peripheral.backrestDeg === type.backrestDeg
  );
}

function hasItsTypeName(peripheral: PeripheralShape): boolean {
  const type = peripheralTypes().find((candidate) => candidate.id === peripheral.typeId);
  return type?.name === peripheral.name;
}

const sameEnvelope = (a: Envelope, b: Envelope) =>
  a.widthMm === b.widthMm && a.heightMm === b.heightMm && a.depthMm === b.depthMm;

const sameHole = (a: Hole, b: Hole) =>
  a.xMm === b.xMm && a.yMm === b.yMm && a.diameterMm === b.diameterMm;

const samePattern = (a: MountingPattern, b: MountingPattern) =>
  a.holes.length === b.holes.length &&
  a.holes.every((hole, index) => sameHole(hole, b.holes[index]));

const sameOffset = (a: Vec3Mm, b: Vec3Mm) => a.x === b.x && a.y === b.y && a.z === b.z;

const sameContactPoints = (a: readonly ContactPoint[], b: readonly ContactPoint[]) =>
  a.length === b.length &&
  a.every(
    (contact, index) =>
      contact.role === b[index].role && sameOffset(contact.offsetMm, b[index].offsetMm),
  );

/** The step that mounts a peripheral, which its edits change. */
function peripheralStep(history: readonly Operation[], partId: string): MountPeripheral {
  const operation = operationMaking(history, partId);
  if (!operation) throw new Error(`Part ${partId} is not in the design history.`);
  if (operation.kind !== 'mount-peripheral')
    throw new Error(`${operation.name} is not a peripheral.`);
  return operation;
}

/** A profile or a plate in the design at step `at`, which a peripheral can be mounted on. */
function mountableAt(history: readonly Operation[], partId: string, at: number): ResolvedPart {
  const parent = replayDesign(history, at).resolved.get(partId);
  if (!parent) throw new Error(`Part ${partId} is not in the design at this step.`);
  if (parent.part.kind !== 'profile' && parent.part.kind !== 'plate')
    throw new Error(
      `A peripheral is mounted on a profile or a plate, and ${parent.part.name} is not one.`,
    );
  return parent;
}

/** The axis a place on a part is measured along: a profile's length, or a plate's depth. */
function alongAxisOf({ part }: ResolvedPart): Axis {
  if (part.kind === 'profile') return part.axis;
  if (part.kind === 'plate') return part.depthAxis;
  throw new Error(`Nothing is mounted on ${part.name}.`);
}

function extentAlong(parent: ResolvedPart): number {
  const axis = alongAxisOf(parent);
  return parent.box.max[axis] - parent.box.min[axis];
}

/** The way a peripheral on `face` faces: `wanted`, unless that would be out of the face. */
function facingAlong(face: Face, wanted: Face): Face {
  if (faceAxis(wanted) !== faceAxis(face)) return wanted;
  return faceAxis(face) === 'y' ? USUAL_FACING : '+y';
}

/** An end face of a profile has a single place to mount on, its center. */
function onAnEndAtItsCenter(
  history: readonly Operation[],
  operation: MountPeripheral,
): MountPeripheral {
  const parent = operationMaking(history, operation.parentId);
  if (!parent || !makesAProfile(parent) || lengthAxisOf(parent) !== faceAxis(operation.face))
    return operation;
  return { ...operation, alongMm: 0, acrossMm: 0 };
}
