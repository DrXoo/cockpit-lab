// Fastening the joints of a design history with connectors (docs/adr/0005). A joint has one
// fastening step, which holds all its connectors: adding or taking one away edits that step, and
// a joint left without connectors loses it. A plate's joint takes bolts instead of brackets: as
// many in each slot of the profile the plate covers. Lengths are in mm.
import type { Axis, Face, Part, ResolvedPart } from './assembly.ts';
import { faceAxis } from './assembly.ts';
import { plateBoltType } from './catalog.ts';
import { coveredSlots, placedBolts, placedConnector } from './connectors.ts';
import {
  addOperation,
  changeOperation,
  deleteOperation,
  FACES,
  isBolts,
  isBracket,
  nextIdentifiers,
  replayDesign,
  type BoltsChoice,
  type ConnectorChoice,
  type FastenJoint,
  type JoinParts,
  type Operation,
} from './history.ts';
import { jointIdOf, joinedTogether, meetsEndOn, touchingFace, type Joint } from './joints.ts';

/** The only corner bracket in the catalog so far. */
const CORNER_BRACKET_ID = 'corner-bracket-40';
/** The only plate bolt in the catalog so far. */
const PLATE_BOLT_ID = 'plate-bolt-m8';

/** A joint of a part as the inspector shows it. */
export interface JointOfPart {
  jointId: string;
  partName: string;
  toPartName: string;
  /** The sides of the joined part that have a connector. */
  sides: Face[];
  /** The sides of the joined part where a corner bracket fits. */
  fittingSides: Face[];
  /** The sides that fit along the part it meets, where the quick action puts two brackets. */
  alongSides: Face[];
  /**
   * For a plate's joint to a profile, the bolts in each slot (0 without them) and the slots the
   * plate covers; null for joints that bolts do not fasten.
   */
  bolts: { perSlot: number; slots: number } | null;
}

interface JointAtStep {
  joint: Joint;
  joined: ResolvedPart;
  met: ResolvedPart;
}

/** A joint in the design at step `at`, with its two parts, or an error saying it is not. */
function jointAt(history: readonly Operation[], jointId: string, at: number): JointAtStep {
  const design = replayDesign(history, at);
  const joint = design.joints.find((candidate) => candidate.id === jointId);
  const joined = joint && design.resolved.get(joint.partId);
  const met = joint && design.resolved.get(joint.toPartId);
  if (!joint || !joined || !met) throw new Error(`There is no joint ${jointId} at this step.`);
  return { joint, joined, met };
}

/** Why a corner bracket on `side` would not fit the joint, or null when it fits. */
function bracketMisfit({ joint, joined, met }: JointAtStep, side: Face): string | null {
  const placed = placedConnector(joint, joined, met, {
    id: side,
    jointId: joint.id,
    typeId: CORNER_BRACKET_ID,
    side,
  });
  return typeof placed === 'string' ? placed : null;
}

/** The sides of the joined part where a corner bracket fits the joint. */
export function fittingSides(
  history: readonly Operation[],
  jointId: string,
  at: number = history.length,
): Face[] {
  const found = jointAt(history, jointId, at);
  return FACES.filter((side) => bracketMisfit(found, side) === null);
}

/** The sides that fit along the length of the part the joint meets. */
function alongSides(found: JointAtStep, fitting: readonly Face[]): Face[] {
  const met = found.met.part;
  const along: Axis | null = met.kind === 'profile' ? met.axis : null;
  return fitting.filter((side) => faceAxis(side) === along);
}

/** The joints a part is in, as the joined part or the part met, at step `at`. */
export function jointsOfPart(
  history: readonly Operation[],
  partId: string,
  at: number = history.length,
): JointOfPart[] {
  const design = replayDesign(history, at);
  const nameOf = (id: string) => design.resolved.get(id)?.part.name ?? id;
  return design.joints
    .filter((joint) => joint.partId === partId || joint.toPartId === partId)
    .map((joint) => {
      const fitting = fittingSides(history, joint.id, at);
      const found = jointAt(history, joint.id, at);
      const choices = fasteningOf(history, joint.id)?.connectors ?? [];
      return {
        jointId: joint.id,
        partName: nameOf(joint.partId),
        toPartName: nameOf(joint.toPartId),
        sides: choices.filter(isBracket).map(({ side }) => side),
        fittingSides: fitting,
        alongSides: alongSides(found, fitting),
        bolts: boltsOf(found, choices),
      };
    });
}

/** Profiles join profiles and plates; a plate joins only profiles, which it is bolted to. */
export const joinable = (a: Part, b: Part): boolean =>
  (a.kind === 'profile' && (b.kind === 'profile' || b.kind === 'plate')) ||
  (a.kind === 'plate' && b.kind === 'profile');

/** The bolts a plate's joint has in each slot, and the slots it covers; null for other joints. */
function boltsOf(
  { joint, joined, met }: JointAtStep,
  choices: readonly ConnectorChoice[],
): JointOfPart['bolts'] {
  if (joined.part.kind !== 'plate' || met.part.kind !== 'profile') return null;
  const slots = coveredSlots(joint, joined, met, plateBoltType(PLATE_BOLT_ID));
  return {
    perSlot: choices.find(isBolts)?.perSlot ?? 0,
    slots: typeof slots === 'string' ? 0 : slots.centersMm.length,
  };
}

/**
 * The parts at step `at` that touch a part without a joint between them, which can be joined
 * to it.
 */
export function touchingParts(
  history: readonly Operation[],
  partId: string,
  at: number = history.length,
): string[] {
  const design = replayDesign(history, at);
  const part = design.resolved.get(partId);
  if (!part) return [];
  return [...design.resolved.values()]
    .filter(
      (other) =>
        joinable(part.part, other.part) &&
        other.part.id !== partId &&
        touchingFace(part, other) !== null &&
        !joinedTogether(design.joints, partId, other.part.id),
    )
    .map((other) => other.part.id);
}

/**
 * Joins two parts that touch, as a step at `at`, the history marker. A plate goes first, as it
 * does when it rests on a profile; otherwise the part that meets the other end on does, so the
 * joint is the one a corner bracket fits.
 */
export function joinParts(
  history: readonly Operation[],
  partId: string,
  otherId: string,
  at: number = history.length,
): Operation[] {
  const design = replayDesign(history, at);
  const part = design.resolved.get(partId);
  const other = design.resolved.get(otherId);
  if (!part || !other) throw new Error('Both parts must be in the design at this step.');
  if (joinedTogether(design.joints, partId, otherId))
    throw new Error(`${part.part.name} and ${other.part.name} are already joined.`);
  if (!touchingParts(history, partId, at).includes(otherId))
    throw new Error(
      `${part.part.name} does not touch ${other.part.name}, so they cannot be joined.`,
    );
  const swapped =
    part.part.kind !== 'plate' &&
    (other.part.kind === 'plate' || (!meetsEndOn(part, other) && meetsEndOn(other, part)));
  const join: JoinParts = {
    kind: 'join-parts',
    id: nextIdentifiers(history).id,
    partId: swapped ? otherId : partId,
    toPartId: swapped ? partId : otherId,
  };
  return addOperation(history, join, at);
}

/** The step that fastens a joint, if it has one. */
export function fasteningOf(
  history: readonly Operation[],
  jointId: string,
): FastenJoint | undefined {
  return history.find(
    (operation): operation is FastenJoint =>
      operation.kind === 'fasten-joint' && jointIdOf(operation) === jointId,
  );
}

/**
 * Puts a corner bracket on one side of a joint, or takes it away. The first connector of a joint
 * adds its fastening step at `at`, the history marker; the last one taken away deletes it.
 */
export function setConnector(
  history: readonly Operation[],
  jointId: string,
  side: Face,
  on: boolean,
  at: number = history.length,
): Operation[] {
  const existing = fasteningOf(history, jointId);
  const kept =
    existing?.connectors.filter((connector) => !isBracket(connector) || connector.side !== side) ??
    [];
  if (!on) {
    if (!existing) return [...history];
    if (kept.length === 0) return deleteOperation(history, existing.id);
    return changeOperation(history, { ...existing, connectors: kept });
  }
  const found = jointAt(history, jointId, at);
  const misfit = bracketMisfit(found, side);
  if (misfit) throw new Error(misfit);
  return withConnectors(history, found.joint, [...kept, { typeId: CORNER_BRACKET_ID, side }], at);
}

/**
 * Puts two corner brackets on a joint, one each side along the part it meets, keeping the
 * connectors it has.
 */
export function fastenWithBrackets(
  history: readonly Operation[],
  jointId: string,
  at: number = history.length,
): Operation[] {
  const found = jointAt(history, jointId, at);
  const along = alongSides(found, fittingSides(history, jointId, at));
  if (along.length === 0) {
    const names = `${found.joined.part.name} to ${found.met.part.name}`;
    throw new Error(
      `No corner bracket fits the joint of ${names} along ${found.met.part.name}: its legs would not rest on both parts.`,
    );
  }
  const kept = fasteningOf(history, jointId)?.connectors ?? [];
  const added = along
    .filter((side) => !kept.some((connector) => isBracket(connector) && connector.side === side))
    .map((side): ConnectorChoice => ({ typeId: CORNER_BRACKET_ID, side }));
  return withConnectors(history, found.joint, [...kept, ...added], at);
}

/** The joint's fastening step with these connectors, added at `at` if it had none. */
function withConnectors(
  history: readonly Operation[],
  joint: Joint,
  connectors: ConnectorChoice[],
  at: number,
): Operation[] {
  const existing = fasteningOf(history, joint.id);
  if (existing) return changeOperation(history, { ...existing, connectors });
  const fastening: FastenJoint = {
    kind: 'fasten-joint',
    id: nextIdentifiers(history).id,
    partId: joint.partId,
    toPartId: joint.toPartId,
    connectors,
  };
  return addOperation(history, fastening, at);
}

/**
 * Fastens a plate's joint to a profile with `perSlot` bolts in each slot the plate covers,
 * spaced evenly along where they touch; none takes the joint's fastening step away. The step is
 * added at `at`, the history marker, if the joint had none.
 */
export function fastenWithBolts(
  history: readonly Operation[],
  jointId: string,
  perSlot: number,
  at: number = history.length,
): Operation[] {
  const existing = fasteningOf(history, jointId);
  if (perSlot === 0) return existing ? deleteOperation(history, existing.id) : [...history];
  const found = jointAt(history, jointId, at);
  const bolts: BoltsChoice = { typeId: PLATE_BOLT_ID, perSlot };
  const placed = placedBolts(found.joint, found.joined, found.met, { id: jointId, ...bolts });
  if (typeof placed === 'string') throw new Error(placed);
  return withConnectors(history, found.joint, [bolts], at);
}
